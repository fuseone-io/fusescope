package ingest

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/fuseone-io/fusescope-collector-server/components/pkg/ingestpolicy"
	"github.com/open-telemetry/opamp-go/protobufs"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// fakeConn records the policies sent to it; with gate set, each send
// waits for it.
type fakeConn struct {
	mu   sync.Mutex
	sent []uint64
	data [][]byte
	gate chan struct{}
}

func (c *fakeConn) Send(ctx context.Context, msg *protobufs.ServerToAgent) error {
	if c.gate != nil {
		select {
		case <-c.gate:
		case <-ctx.Done():
			return ctx.Err()
		}
	}
	m := msg.GetCustomMessage()
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

func eventually(t *testing.T, conn *fakeConn, want []uint64) {
	t.Helper()
	require.Eventually(t, func() bool { return assert.ObjectsAreEqual(want, conn.versions()) }, 5*time.Second, time.Millisecond, "want %v, got %v", want, conn.versions())
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
