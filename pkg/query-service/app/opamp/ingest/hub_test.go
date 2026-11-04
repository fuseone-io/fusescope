package ingest

import (
	"context"
	"fmt"

	"log/slog"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/fuseone-io/fusescope-collector-server/components/pkg/ingestpolicy"
	"github.com/open-telemetry/opamp-go/protobufs"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/fuseone-io/fusescope/pkg/sqlstore"
	"github.com/fuseone-io/fusescope/pkg/types/ingesttypes"
)

// fakeConn records the policies sent to it; with gate set, each send
// waits for it.
type fakeConn struct {
	mu           sync.Mutex
	sent         []uint64
	data         [][]byte
	acks         []uint64
	gate         chan struct{}
	fails        int
	disconnected atomic.Bool
	inFlight     *atomic.Int32
	maxInFlight  *atomic.Int32
}

func (c *fakeConn) Disconnect() error {
	c.disconnected.Store(true)
	return nil
}

func (c *fakeConn) Send(ctx context.Context, msg *protobufs.ServerToAgent) error {
	c.mu.Lock()
	if c.fails > 0 {
		c.fails--
		c.mu.Unlock()
		return assertError("connection reset")
	}
	c.mu.Unlock()
	if c.inFlight != nil {
		n := c.inFlight.Add(1)
		defer c.inFlight.Add(-1)
		for {
			m := c.maxInFlight.Load()
			if n <= m || c.maxInFlight.CompareAndSwap(m, n) {
				break
			}
		}
	}
	if c.gate != nil {
		select {
		case <-c.gate:
		case <-ctx.Done():
			return ctx.Err()
		}
	}
	m := msg.GetCustomMessage()
	if m.GetCapability() == ingestpolicy.Capability && m.GetType() == ingestpolicy.TypeReportAck {
		seq, err := ingestpolicy.ParseReportAck(m.GetData())
		if err != nil {
			panic("not a reportAck")
		}
		c.mu.Lock()
		defer c.mu.Unlock()
		c.acks = append(c.acks, seq)
		return nil
	}
	policy, err := ingestpolicy.Parse(m.GetData())
	if err != nil || m.GetCapability() != ingestpolicy.Capability || m.GetType() != ingestpolicy.TypePolicy {
		panic("not a policy message")
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	c.sent = append(c.sent, policy.Version)
	c.data = append(c.data, m.GetData())
	return nil
}

func (c *fakeConn) policies() [][]byte {
	c.mu.Lock()
	defer c.mu.Unlock()
	return append([][]byte(nil), c.data...)
}

func (c *fakeConn) acknowledged() []uint64 {
	c.mu.Lock()
	defer c.mu.Unlock()
	return append([]uint64(nil), c.acks...)
}

func (c *fakeConn) versions() []uint64 {
	c.mu.Lock()
	defer c.mu.Unlock()
	return append([]uint64(nil), c.sent...)
}

func describe(role string, capabilities ...string) *protobufs.AgentToServer {
	msg := &protobufs.AgentToServer{InstanceUid: []byte("0123456789abcdef")}
	if role != "" {
		msg.AgentDescription = &protobufs.AgentDescription{NonIdentifyingAttributes: []*protobufs.KeyValue{
			{Key: RoleAttribute, Value: &protobufs.AnyValue{Value: &protobufs.AnyValue_StringValue{StringValue: role}}},
		}}
	}
	if capabilities != nil {
		msg.CustomCapabilities = &protobufs.CustomCapabilities{Capabilities: capabilities}
	}
	return msg
}

func newTestHub(t *testing.T) (*Hub, *Publisher, *fakeSource) {
	t.Helper()
	source := &fakeSource{}
	source.set(1)
	publisher := NewPublisher(newTestStore(t), source, slogDiscard())
	_, err := publisher.Revise(context.Background())
	require.NoError(t, err)
	hub := NewHub(publisher, slogDiscard())
	t.Cleanup(hub.Close)
	return hub, publisher, source
}

// eventuallyTimeout is generous on purpose: Eventually returns as soon as
// the condition holds, and CI runs every package at once on a few CPUs,
// where 5 s once passed with the first revision not done (#321).
const eventuallyTimeout = 30 * time.Second

func eventually(t *testing.T, conn *fakeConn, want []uint64) {
	t.Helper()
	require.Eventually(t, func() bool { return assert.ObjectsAreEqual(want, conn.versions()) }, eventuallyTimeout, time.Millisecond, "want %v, got %v", want, conn.versions())
}

// testLogger writes warnings and errors to the test's log, so a failed
// revision shows in a failing run. Writes after the test are dropped.
func testLogger(t *testing.T) *slog.Logger {
	t.Helper()
	w := &testLogWriter{t: t}
	t.Cleanup(w.close)
	return slog.New(slog.NewTextHandler(w, &slog.HandlerOptions{Level: slog.LevelWarn}))
}

type testLogWriter struct {
	mu     sync.Mutex
	t      *testing.T
	closed bool
}

func (w *testLogWriter) Write(p []byte) (int, error) {
	w.mu.Lock()
	defer w.mu.Unlock()
	if !w.closed {
		w.t.Log(strings.TrimSuffix(string(p), "\n"))
	}
	return len(p), nil
}

func (w *testLogWriter) close() {
	w.mu.Lock()
	defer w.mu.Unlock()
	w.closed = true
}

func never(t *testing.T, conn *fakeConn, want []uint64) {
	t.Helper()
	time.Sleep(50 * time.Millisecond)
	assert.Equal(t, want, conn.versions())
}

func TestHubSendsOnlyToIngressWithTheCapability(t *testing.T) {
	hub, _, _ := newTestHub(t)
	for name, msg := range map[string]*protobufs.AgentToServer{
		"writer":        describe("writer", ingestpolicy.Capability),
		"no role":       describe("", ingestpolicy.Capability),
		"no capability": describe(RoleIngress),
		"other caps":    describe(RoleIngress, "io.example.other"),
	} {
		t.Run(name, func(t *testing.T) {
			conn := &fakeConn{}
			hub.Observe(name, conn, msg)
			hub.Broadcast()
			never(t, conn, nil)
		})
	}

	conn := &fakeConn{}
	hub.Observe("ingress", conn, describe(RoleIngress, ingestpolicy.Capability))
	eventually(t, conn, []uint64{1})
	hub.Observe("ingress", conn, &protobufs.AgentToServer{InstanceUid: []byte("0123456789abcdef")})
	never(t, conn, []uint64{1}) // a heartbeat keeps the state and sends nothing
	hub.Broadcast()
	eventually(t, conn, []uint64{1, 1})

	hub.Observe("ingress", conn, describe("writer"))
	hub.Broadcast()
	never(t, conn, []uint64{1, 1})
}

func TestHubNewVersionAndRemove(t *testing.T) {
	hub, publisher, source := newTestHub(t)
	conn := &fakeConn{}
	hub.Observe("agent", conn, describe(RoleIngress, ingestpolicy.Capability))
	eventually(t, conn, []uint64{1})

	source.set(2)
	changed, err := publisher.Revise(context.Background())
	require.NoError(t, err)
	require.True(t, changed)
	hub.Broadcast()
	eventually(t, conn, []uint64{1, 2})

	hub.Remove(conn)
	hub.Broadcast()
	never(t, conn, []uint64{1, 2})

	// Reconnected on a new connection, it gets the policy at once.
	again := &fakeConn{}
	hub.Observe("agent", again, describe(RoleIngress, ingestpolicy.Capability))
	eventually(t, again, []uint64{2})
}

// A slow agent holds only its own sender, and gets the latest version
// once it is free, not every one in between.
func TestHubSlowAgentGetsLatest(t *testing.T) {
	hub, publisher, source := newTestHub(t)
	slow := &fakeConn{gate: make(chan struct{})}
	fast := &fakeConn{}
	hub.Observe("slow", slow, describe(RoleIngress, ingestpolicy.Capability))
	hub.Observe("fast", fast, describe(RoleIngress, ingestpolicy.Capability))
	eventually(t, fast, []uint64{1})

	for keys := 2; keys <= 5; keys++ {
		source.set(keys)
		_, err := publisher.Revise(context.Background())
		require.NoError(t, err)
		hub.Broadcast()
	}
	require.Eventually(t, func() bool {
		v := fast.versions()
		return v[len(v)-1] == 5
	}, 5*time.Second, time.Millisecond, "the fast agent is not held by the slow one")
	close(slow.gate)
	require.Eventually(t, func() bool {
		v := slow.versions()
		return len(v) > 0 && v[len(v)-1] == 5
	}, 5*time.Second, time.Millisecond)
	assert.LessOrEqual(t, len(slow.versions()), 2, "the first send, then only the latest")
}

func TestHubNothingBeforeAPolicy(t *testing.T) {
	source := &fakeSource{}
	source.set(1)
	publisher := NewPublisher(newTestStore(t), source, slogDiscard())
	hub := NewHub(publisher, slogDiscard())
	t.Cleanup(hub.Close)
	conn := &fakeConn{}
	hub.Observe("agent", conn, describe(RoleIngress, ingestpolicy.Capability))
	never(t, conn, nil)

	_, err := publisher.Revise(context.Background())
	require.NoError(t, err)
	hub.Broadcast()
	eventually(t, conn, []uint64{1})
}

func TestServiceRun(t *testing.T) {
	source := &fakeSource{}
	source.set(1)
	store := newTestStore(t)
	publisher := NewPublisher(store, source, slogDiscard())
	hub := NewHub(publisher, slogDiscard())
	service := NewService(publisher, hub, slogDiscard())
	service.pollEvery, service.resendEvery = 10*time.Millisecond, time.Hour

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() { service.Run(ctx); close(done) }()
	t.Cleanup(func() { cancel(); <-done })

	conn := &fakeConn{}
	hub.Observe("agent", conn, describe(RoleIngress, ingestpolicy.Capability))
	eventually(t, conn, []uint64{1})

	source.set(2)
	service.Changed()
	eventually(t, conn, []uint64{1, 2})

	// Another replica issues version 3; the poll picks it up.
	source.set(3)
	other := NewPublisher(store, source, slogDiscard())
	_, err := other.Revise(context.Background())
	require.NoError(t, err)
	eventually(t, conn, []uint64{1, 2, 3})
	assert.Equal(t, other.Current().Data, conn.data[2], "the same bytes from either replica")
}

func TestServiceResendsRegardless(t *testing.T) {
	source := &fakeSource{}
	source.set(1)
	publisher := NewPublisher(newTestStore(t), source, slogDiscard())
	hub := NewHub(publisher, slogDiscard())
	service := NewService(publisher, hub, slogDiscard())
	service.pollEvery, service.resendEvery = time.Hour, 20*time.Millisecond

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() { service.Run(ctx); close(done) }()
	t.Cleanup(func() { cancel(); <-done })

	conn := &fakeConn{}
	hub.Observe("agent", conn, describe(RoleIngress, ingestpolicy.Capability))
	require.Eventually(t, func() bool { return len(conn.versions()) >= 3 }, 5*time.Second, time.Millisecond)
	for _, v := range conn.versions() {
		assert.Equal(t, uint64(1), v, "unchanged content keeps its version")
	}
}

// A failed write leaves the WebSocket unusable: the agent is disconnected,
// and its reconnection gets the policy at once.
func TestHubDisconnectsOnFailedSend(t *testing.T) {
	hub, _, _ := newTestHub(t)
	broken := &fakeConn{fails: 1}
	hub.Observe("agent", broken, describe(RoleIngress, ingestpolicy.Capability))
	require.Eventually(t, broken.disconnected.Load, 5*time.Second, time.Millisecond)
	hub.Remove(broken)

	again := &fakeConn{}
	hub.Observe("agent", again, describe(RoleIngress, ingestpolicy.Capability))
	eventually(t, again, []uint64{1})
}

func TestHubBoundsAgents(t *testing.T) {
	hub, _, _ := newTestHub(t)
	hub.maxAgents = 3
	conns := make([]*fakeConn, 5)
	for i := range conns {
		conns[i] = &fakeConn{}
		hub.Observe(fmt.Sprintf("agent-%d", i), conns[i], describe(RoleIngress, ingestpolicy.Capability))
	}
	for i := range 3 {
		eventually(t, conns[i], []uint64{1})
	}
	never(t, conns[3], nil)
	never(t, conns[4], nil)

	hub.Remove(conns[0])
	hub.Observe("agent-4", conns[4], describe(RoleIngress, ingestpolicy.Capability))
	eventually(t, conns[4], []uint64{1})
}

// At most maxSends policies are encoded and written at once, whatever the
// number of agents.
func TestHubBoundsConcurrentSends(t *testing.T) {
	hub, _, _ := newTestHub(t)
	gate := make(chan struct{})
	var inFlight, peak atomic.Int32
	conns := make([]*fakeConn, 3*maxSends)
	for i := range conns {
		conns[i] = &fakeConn{gate: gate, inFlight: &inFlight, maxInFlight: &peak}
		hub.Observe(fmt.Sprintf("agent-%d", i), conns[i], describe(RoleIngress, ingestpolicy.Capability))
	}
	require.Eventually(t, func() bool { return inFlight.Load() == maxSends }, 5*time.Second, time.Millisecond)
	time.Sleep(50 * time.Millisecond)
	assert.Equal(t, int32(maxSends), peak.Load())
	close(gate)
	for _, conn := range conns {
		eventually(t, conn, []uint64{1})
	}
	assert.Equal(t, int32(maxSends), peak.Load())
}

func startService(t *testing.T, service *Service) {
	t.Helper()
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() { service.Run(ctx); close(done) }()
	t.Cleanup(func() { cancel(); <-done })
}

// A change committed by a replica that stopped before revising reaches
// the agents at the next poll of any replica: it is recorded in the
// database, not only in the stopped replica's memory.
func TestServiceRevisesChangeOfStoppedReplica(t *testing.T) {
	source := &fakeSource{}
	source.set(1)
	store := newTestStore(t)
	publisher := NewPublisher(store, source, slogDiscard())
	hub := NewHub(publisher, slogDiscard())
	service := NewService(publisher, hub, slogDiscard())
	service.pollEvery, service.resendEvery = 10*time.Millisecond, time.Hour
	startService(t, service)

	conn := &fakeConn{}
	hub.Observe("agent", conn, describe(RoleIngress, ingestpolicy.Capability))
	eventually(t, conn, []uint64{1})

	source.set(2)
	require.NoError(t, ingesttypes.Touch(context.Background(), store.BunDB(), time.Now()))
	eventually(t, conn, []uint64{1, 2})
}

// A failed revision is retried with backoff, not only at the next change.
func TestServiceRetriesFailedRevision(t *testing.T) {
	source := &fakeSource{err: assertError("database down")}
	source.content = testContent(1)
	publisher := NewPublisher(newTestStore(t), source, slogDiscard())
	hub := NewHub(publisher, slogDiscard())
	service := NewService(publisher, hub, slogDiscard())
	service.pollEvery, service.resendEvery = time.Hour, time.Hour
	startService(t, service)

	conn := &fakeConn{}
	hub.Observe("agent", conn, describe(RoleIngress, ingestpolicy.Capability))
	time.Sleep(100 * time.Millisecond)
	source.mu.Lock()
	source.err = nil
	source.mu.Unlock()
	eventually(t, conn, []uint64{1})
}

// A rollback leaves only the older producer: the newer one published and
// stopped. A revocation recorded then reaches the agents within the 10 s
// of ADR 0010 §3, with the production poll and grace, not after the
// newer producer's lease.
func TestServiceRevocationAfterRollback(t *testing.T) {
	forEachStore(t, func(t *testing.T, newStore func(*testing.T) sqlstore.SQLStore) {
		ctx := context.Background()
		store := newStore(t)
		logger := testLogger(t)
		source := &fakeSource{}
		source.set(2)
		newer := NewPublisher(store, source, logger)
		newer.producer = Producer + 1
		_, err := newer.Revise(ctx)
		require.NoError(t, err)

		older := NewPublisher(store, source, logger)
		hub := NewHub(older, logger)
		startService(t, NewService(older, hub, logger))
		conn := &fakeConn{}
		hub.Observe("agent", conn, describe(RoleIngress, ingestpolicy.Capability))
		eventually(t, conn, []uint64{1})
		assert.Equal(t, newer.Current().Data, conn.data[0], "it follows the newer producer's bytes")

		revoked := time.Now()
		require.NoError(t, store.RunInTxCtx(ctx, nil, func(ctx context.Context) error {
			source.set(1) // a key revoked
			return ingesttypes.Touch(ctx, store.BunDBCtx(ctx), time.Now())
		}))
		require.Eventually(t, func() bool { return len(conn.versions()) == 2 }, 10*time.Second, 10*time.Millisecond, "the revocation waited for the lease")
		t.Logf("revocation published after %v", time.Since(revoked).Round(100*time.Millisecond))
		policy, err := ingestpolicy.Parse(conn.data[1])
		require.NoError(t, err)
		assert.Len(t, policy.Keys, 1)
	})
}

// With the newer producer running, it revises a recorded change within the
// grace, so the older one never takes over and no version is spent twice.
func TestServiceNoFailoverWhileNewerRuns(t *testing.T) {
	ctx := context.Background()
	store := newTestStore(t)
	newerSource, olderSource := &fakeSource{}, &fakeSource{}
	newerSource.set(2)
	olderSource.set(5) // a different build of the content
	newer := NewPublisher(store, newerSource, slogDiscard())
	newer.producer = Producer + 1
	older := NewPublisher(store, olderSource, slogDiscard())
	_, err := newer.Revise(ctx) // the newer release is already serving
	require.NoError(t, err)
	startService(t, NewService(newer, NewHub(newer, slogDiscard()), slogDiscard()))
	startService(t, NewService(older, NewHub(older, slogDiscard()), slogDiscard()))
	require.Eventually(t, func() bool { c := older.Current(); return c != nil && c.Version == 1 }, 5*time.Second, 10*time.Millisecond)

	require.NoError(t, store.RunInTxCtx(ctx, nil, func(ctx context.Context) error {
		newerSource.set(1)
		return ingesttypes.Touch(ctx, store.BunDBCtx(ctx), time.Now())
	}))
	require.Eventually(t, func() bool { c := older.Current(); return c != nil && c.Version == 2 }, 10*time.Second, 10*time.Millisecond)
	time.Sleep(2 * failoverGrace)
	row := new(ingesttypes.StorableRevision)
	require.NoError(t, store.BunDB().NewSelect().Model(row).ExcludeColumn("data").Where("id = ?", ingesttypes.RevisionID).Scan(ctx))
	assert.Equal(t, int64(Producer+1), row.Producer, "the older producer never took over")
	assert.Equal(t, int64(2), row.Version)
}

func changedAt(t *testing.T, store sqlstore.SQLStore) time.Time {
	t.Helper()
	row := new(ingesttypes.StorableRevision)
	require.NoError(t, store.BunDB().NewSelect().Model(row).ExcludeColumn("data").Where("id = ?", ingesttypes.RevisionID).Scan(context.Background()))
	require.NotNil(t, row.ChangedAt)
	return *row.ChangedAt
}

// A change keeps the time of the oldest one no revision has read; only a
// change after a revision starts it again.
func TestTouchKeepsOldestPendingChange(t *testing.T) {
	forEachStore(t, func(t *testing.T, newStore func(*testing.T) sqlstore.SQLStore) {
		ctx := context.Background()
		store := newStore(t)
		publisher := NewPublisher(store, &fakeSource{content: testContent(1)}, slogDiscard())
		_, err := publisher.Revise(ctx)
		require.NoError(t, err)

		require.NoError(t, ingesttypes.Touch(ctx, store.BunDB(), time.Now()))
		first := changedAt(t, store)
		time.Sleep(1100 * time.Millisecond) // SQLite's clock has whole seconds
		require.NoError(t, ingesttypes.Touch(ctx, store.BunDB(), time.Now()))
		assert.Equal(t, first, changedAt(t, store), "a later change does not hide the first")

		_, err = publisher.Revise(ctx)
		require.NoError(t, err)
		require.NoError(t, ingesttypes.Touch(ctx, store.BunDB(), time.Now()))
		assert.True(t, changedAt(t, store).After(first), "after a revision the next change starts the wait")
	})
}

// Changes every half second after a rollback: the first, a revocation,
// still goes out within 10 s, the stream cannot postpone the failover.
func TestServiceRevocationUnderChangeStream(t *testing.T) {
	forEachStore(t, func(t *testing.T, newStore func(*testing.T) sqlstore.SQLStore) {
		ctx := context.Background()
		store := newStore(t)
		source := &fakeSource{}
		source.set(3)
		newer := NewPublisher(store, source, slogDiscard())
		newer.producer = Producer + 1
		_, err := newer.Revise(ctx)
		require.NoError(t, err)

		older := NewPublisher(store, source, slogDiscard())
		hub := NewHub(older, slogDiscard())
		startService(t, NewService(older, hub, slogDiscard()))
		conn := &fakeConn{}
		hub.Observe("agent", conn, describe(RoleIngress, ingestpolicy.Capability))
		eventually(t, conn, []uint64{1})

		touch := func(keys int) {
			assert.NoError(t, store.RunInTxCtx(ctx, nil, func(ctx context.Context) error {
				source.set(keys)
				return ingesttypes.Touch(ctx, store.BunDBCtx(ctx), time.Now())
			}))
		}
		revoked := time.Now()
		touch(2) // the revocation
		stop := make(chan struct{})
		done := make(chan struct{})
		go func() {
			defer close(done)
			for i := 0; ; i++ {
				select {
				case <-stop:
					return
				case <-time.After(500 * time.Millisecond):
					touch(2) // metadata changes that keep the revocation in
				}
			}
		}()
		defer func() { close(stop); <-done }()
		require.Eventually(t, func() bool {
			for _, data := range conn.policies()[1:] {
				policy, err := ingestpolicy.Parse(data)
				if err == nil && len(policy.Keys) == 2 {
					return true
				}
			}
			return false
		}, 10*time.Second, 10*time.Millisecond, "the change stream postponed the revocation")
		t.Logf("revocation published after %v", time.Since(revoked).Round(100*time.Millisecond))
	})
}

// The retrier's acknowledgements go through the agent's sender, only to an
// eligible agent; one waiting is replaced by a newer one.
func TestHubAck(t *testing.T) {
	hub, _, _ := newTestHub(t)
	conn := &fakeConn{}
	hub.Ack("agent", 1)
	hub.Observe("agent", conn, describe(RoleIngress, ingestpolicy.Capability))
	eventually(t, conn, []uint64{1})
	assert.Empty(t, conn.acknowledged(), "nothing waits from before the agent was eligible")

	hub.Ack("agent", 7)
	require.Eventually(t, func() bool { return assert.ObjectsAreEqual([]uint64{7}, conn.acknowledged()) }, 5*time.Second, time.Millisecond)

	gate := make(chan struct{})
	conn.mu.Lock()
	conn.gate = gate
	conn.mu.Unlock()
	hub.Ack("agent", 8) // taken by the sender, which blocks on the gate
	require.Eventually(t, func() bool {
		hub.mu.Lock()
		defer hub.mu.Unlock()
		return len(hub.agents["agent"].peer.ack) == 0
	}, 5*time.Second, time.Millisecond)
	hub.Ack("agent", 9)
	hub.Ack("agent", 10)
	close(gate)
	require.Eventually(t, func() bool { return assert.ObjectsAreEqual([]uint64{7, 8, 10}, conn.acknowledged()) }, 5*time.Second, time.Millisecond)

	other := &fakeConn{}
	hub.Observe("writer", other, describe("writer", ingestpolicy.Capability))
	hub.Ack("writer", 3)
	time.Sleep(50 * time.Millisecond)
	assert.Empty(t, other.acknowledged(), "not to an agent that gets no policy")
}
