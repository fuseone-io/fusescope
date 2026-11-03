package ingest

import (
	"context"
	"log/slog"
	"slices"
	"sync"
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

	pollEvery   = 5 * time.Second
	resendEvery = 5 * time.Minute
	sendTimeout = time.Minute
)

// Connection sends to one agent; opamp-go's server connections serialise
// their writes.
type Connection interface {
	Send(ctx context.Context, msg *protobufs.ServerToAgent) error
}

// Hub sends the current snapshot to every connected ingress agent that
// declared the capability: on connect, on a new version, and every
// resendEvery regardless. Each agent has one sender goroutine and one
// pending wake, so a slow agent delays only itself and gets the latest.
type Hub struct {
	publisher *Publisher
	logger    *slog.Logger

	mu     sync.Mutex
	agents map[string]*agentState
	done   chan struct{}
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
	return &Hub{publisher: publisher, logger: logger, agents: map[string]*agentState{}, done: make(chan struct{})}
}

// Observe takes an agent's message. The description and the custom
// capabilities arrive on the first message of a connection and whenever
// they change; absent, the last ones hold.
func (hub *Hub) Observe(agentID string, conn Connection, msg *protobufs.AgentToServer) {
	hub.mu.Lock()
	defer hub.mu.Unlock()
	state, ok := hub.agents[agentID]
	if !ok {
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
		ctx, cancel := context.WithTimeout(context.Background(), sendTimeout)
		err := conn.Send(ctx, &protobufs.ServerToAgent{
			InstanceUid: uid,
			CustomMessage: &protobufs.CustomMessage{
				Capability: ingestpolicy.Capability,
				Type:       ingestpolicy.TypePolicy,
				Data:       snapshot.Data,
			},
		})
		cancel()
		if err != nil {
			hub.logger.Warn("ingest policy not sent", slog.String("agent_id", agentID), slog.Uint64("version", snapshot.Version), errors.Attr(err))
			continue
		}
		hub.logger.Debug("ingest policy sent", "agent_id", agentID, "version", snapshot.Version, "bytes", len(snapshot.Data))
	}
}

func role(description *protobufs.AgentDescription) string {
	for _, kv := range description.GetNonIdentifyingAttributes() {
		if kv.GetKey() == RoleAttribute {
			return kv.GetValue().GetStringValue()
		}
	}
	return ""
}
