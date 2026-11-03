package ingest

import (
	"context"
	"log/slog"
	"slices"
	"sync"
	"sync/atomic"
	"time"

	"github.com/fuseone-io/fusescope-collector-server/components/pkg/ingestpolicy"
	"github.com/open-telemetry/opamp-go/protobufs"

	"github.com/fuseone-io/fusescope/pkg/errors"
)

const (
	// RoleAttribute is the collector's role in its agent description
	// (ADR 0009 §5); only RoleIngress receives the policy (ADR 0010 §3).
	RoleAttribute = "fusescope.collector.role"
	RoleIngress   = "ingress"

	// MaxMessageSize bounds every OpAMP message the server reads or writes:
	// the largest policy and a margin for the envelope.
	MaxMessageSize = ingestpolicy.MaxSize + 1<<20

	pollEvery   = 2 * time.Second
	resendEvery = 5 * time.Minute
	// sendTimeout is the write deadline of one policy, up to 24 MiB; a
	// peer that cannot take it in time is disconnected.
	sendTimeout = time.Minute
	// maxAgents bounds the ingress agents held, each with a sender;
	// maxSends bounds the sends in flight, each encoding its own copy of
	// the policy.
	maxAgents = 256
	maxSends  = 4
)

// Connection is an agent's connection. opamp-go's serialises its writes
// but ignores Send's context, so the hub bounds a write by closing it.
type Connection interface {
	Send(ctx context.Context, msg *protobufs.ServerToAgent) error
	Disconnect() error
}

// Hub sends the current snapshot to every connected ingress agent that
// declared the capability: on connect, on a new version, and every
// resendEvery regardless. Each agent has one sender goroutine and one
// pending wake, so a slow agent delays only itself and gets the latest.
type Hub struct {
	publisher *Publisher
	logger    *slog.Logger

	sendTimeout time.Duration
	maxAgents   int
	sends       chan struct{}
	refusedLog  atomic.Int64

	mu     sync.Mutex
	agents map[string]*agentState
}

type agentState struct {
	uid     []byte
	conn    Connection
	ingress bool
	capable bool
	peer    *peer
}

type peer struct {
	wake chan struct{}
	stop chan struct{}
}

func NewHub(publisher *Publisher, logger *slog.Logger) *Hub {
	return &Hub{
		publisher: publisher, logger: logger,
		sendTimeout: sendTimeout, maxAgents: maxAgents, sends: make(chan struct{}, maxSends),
		agents: map[string]*agentState{},
	}
}

// Observe takes an agent's message. The description and the custom
// capabilities arrive on the first message of a connection and whenever
// they change; absent, the last ones hold.
func (hub *Hub) Observe(agentID string, conn Connection, msg *protobufs.AgentToServer) {
	hub.mu.Lock()
	defer hub.mu.Unlock()
	state, ok := hub.agents[agentID]
	if !ok {
		if len(hub.agents) >= hub.maxAgents {
			hub.refused(agentID)
			return
		}
		state = &agentState{}
		hub.agents[agentID] = state
	}
	if state.conn != conn && state.peer != nil {
		hub.stop(state)
	}
	state.uid, state.conn = msg.GetInstanceUid(), conn
	if description := msg.GetAgentDescription(); description != nil {
		state.ingress = role(description) == RoleIngress
	}
	if capabilities := msg.GetCustomCapabilities(); capabilities != nil {
		state.capable = slices.Contains(capabilities.GetCapabilities(), ingestpolicy.Capability)
	}
	switch eligible := state.ingress && state.capable; {
	case eligible && state.peer == nil:
		hub.start(agentID, state)
	case !eligible && state.peer != nil:
		hub.stop(state)
	}
}

// Remove forgets the agents of a closed connection.
func (hub *Hub) Remove(conn Connection) {
	hub.mu.Lock()
	defer hub.mu.Unlock()
	for id, state := range hub.agents {
		if state.conn == conn {
			if state.peer != nil {
				hub.stop(state)
			}
			delete(hub.agents, id)
		}
	}
}

// Broadcast wakes every eligible agent's sender.
func (hub *Hub) Broadcast() {
	hub.mu.Lock()
	defer hub.mu.Unlock()
	for _, state := range hub.agents {
		if state.peer != nil {
			wake(state.peer)
		}
	}
}

// Send wakes one agent's sender, if it is eligible.
func (hub *Hub) Send(agentID string) {
	hub.mu.Lock()
	defer hub.mu.Unlock()
	if state := hub.agents[agentID]; state != nil && state.peer != nil {
		wake(state.peer)
	}
}

// Close stops every sender.
func (hub *Hub) Close() {
	hub.mu.Lock()
	defer hub.mu.Unlock()
	for _, state := range hub.agents {
		if state.peer != nil {
			hub.stop(state)
		}
	}
}

// refused logs, at most once a minute, an agent over maxAgents.
func (hub *Hub) refused(agentID string) {
	now := time.Now().UnixNano()
	last := hub.refusedLog.Load()
	if now-last < int64(time.Minute) || !hub.refusedLog.CompareAndSwap(last, now) {
		return
	}
	hub.logger.Warn("ingest policy agents at their bound; further agents get no policy", slog.String("agent_id", agentID), slog.Int("max_agents", hub.maxAgents))
}

func (hub *Hub) start(agentID string, state *agentState) {
	p := &peer{wake: make(chan struct{}, 1), stop: make(chan struct{})}
	state.peer = p
	go hub.send(agentID, state.uid, state.conn, p)
	wake(p)
}

func (hub *Hub) stop(state *agentState) {
	close(state.peer.stop)
	state.peer = nil
}

func wake(p *peer) {
	select {
	case p.wake <- struct{}{}:
	default: // one pending already; it sends the latest
	}
}

// send is an agent's sender. A failed write leaves a WebSocket unusable,
// so the agent is disconnected; its reconnection is the retry, since a new
// connection gets the policy at once.
func (hub *Hub) send(agentID string, uid []byte, conn Connection, p *peer) {
	for {
		select {
		case <-p.stop:
			return
		case <-p.wake:
		}
		snapshot := hub.publisher.Current()
		if snapshot == nil {
			continue
		}
		select {
		case hub.sends <- struct{}{}:
		case <-p.stop:
			return
		}
		err := hub.sendOne(conn, uid, snapshot)
		<-hub.sends
		if err != nil {
			hub.logger.Warn("ingest policy not sent; disconnecting the agent, which reconnects and gets it again", slog.String("agent_id", agentID), slog.Uint64("version", snapshot.Version), errors.Attr(err))
			_ = conn.Disconnect()
			return
		}
		hub.logger.Debug("ingest policy sent", "agent_id", agentID, "version", snapshot.Version, "bytes", len(snapshot.Data))
	}
}

// sendOne writes one policy within sendTimeout. The WebSocket library sets
// its own write deadline on every frame, so a deadline on the network
// connection would not hold; past the timeout the connection is closed
// instead, which ends the blocked write.
func (hub *Hub) sendOne(conn Connection, uid []byte, snapshot *Snapshot) error {
	ctx, cancel := context.WithTimeout(context.Background(), hub.sendTimeout)
	defer cancel()
	var expired atomic.Bool
	watchdog := time.AfterFunc(hub.sendTimeout, func() {
		expired.Store(true)
		_ = conn.Disconnect()
	})
	err := conn.Send(ctx, &protobufs.ServerToAgent{
		InstanceUid: uid,
		CustomMessage: &protobufs.CustomMessage{
			Capability: ingestpolicy.Capability,
			Type:       ingestpolicy.TypePolicy,
			Data:       snapshot.Data,
		},
	})
	watchdog.Stop()
	if err == nil && expired.Load() {
		err = errors.Newf(errors.TypeTimeout, errors.CodeInternal, "ingest policy write past %s", hub.sendTimeout)
	}
	return err
}

func role(description *protobufs.AgentDescription) string {
	for _, kv := range description.GetNonIdentifyingAttributes() {
		if kv.GetKey() == RoleAttribute {
			return kv.GetValue().GetStringValue()
		}
	}
	return ""
}
