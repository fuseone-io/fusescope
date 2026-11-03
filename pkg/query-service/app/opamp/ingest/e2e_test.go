package ingest

import (
	"context"
	"net"
	"net/http"
	"testing"
	"time"

	"github.com/fuseone-io/fusescope-collector-server/components/pkg/ingestpolicy"
	"github.com/fuseone-io/fusescope-collector-server/components/pkg/ingestpolicy/ingestpolicytest"
	"github.com/gorilla/websocket"
	"github.com/open-telemetry/opamp-go/protobufs"
	"github.com/open-telemetry/opamp-go/server"
	servertypes "github.com/open-telemetry/opamp-go/server/types"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"google.golang.org/protobuf/proto"

	"github.com/fuseone-io/fusescope/pkg/modules/rumapplication"
)

// A policy at every count bound of rum.md §11.1 goes through an opamp-go
// server with the backend's settings to an authenticated ingress client,
// which accepts it; a client without the token, declaring the same role and
// capability, receives nothing.
func TestPolicyOverOpAMP(t *testing.T) {
	tokens, err := LoadTokens(writeTokens(t, tokenA+"\n"))
	require.NoError(t, err)
	maxPolicy, err := ingestpolicytest.MaxPolicy(1)
	require.NoError(t, err)
	parsed, err := ingestpolicy.Parse(maxPolicy)
	require.NoError(t, err)
	source := &fakeSource{content: &rumapplication.IngestContent{Keys: parsed.Keys, Applications: parsed.RUMApplications}}
	publisher := NewPublisher(newTestStore(t), source, slogDiscard())
	_, err = publisher.Revise(context.Background())
	require.NoError(t, err)
	t.Logf("snapshot of %d bytes", len(publisher.Current().Data))
	hub := NewHub(publisher, slogDiscard())
	t.Cleanup(hub.Close)

	addr := startOpAMP(t, hub, tokens)

	intruder := connect(t, addr, "", "fedcba9876543210")
	received := connect(t, addr, "Bearer "+tokenA, "0123456789abcdef")

	select {
	case data := <-received:
		policy, err := ingestpolicy.Parse(data)
		require.NoError(t, err)
		require.NoError(t, ingestpolicy.Validate(policy))
		require.Len(t, policy.Keys, ingestpolicy.MaxKeys)
		require.Equal(t, publisher.Current().Data, data)
	case <-time.After(30 * time.Second):
		t.Fatal("no policy received")
	}
	select {
	case <-intruder:
		t.Fatal("a client without the token received the policy")
	case <-time.After(200 * time.Millisecond):
	}
}

// connect opens an OpAMP WebSocket as an ingress collector declaring the
// capability, and returns the policies it receives.
func connect(t *testing.T, addr, authorization, uid string) <-chan []byte {
	t.Helper()
	header := http.Header{}
	if authorization != "" {
		header.Set("Authorization", authorization)
	}
	conn, _, err := websocket.DefaultDialer.Dial("ws://"+addr+"/v1/opamp", header)
	require.NoError(t, err)
	t.Cleanup(func() { _ = conn.Close() })
	conn.SetReadLimit(MaxMessageSize)
	hello, err := proto.Marshal(&protobufs.AgentToServer{
		InstanceUid: []byte(uid),
		AgentDescription: &protobufs.AgentDescription{NonIdentifyingAttributes: []*protobufs.KeyValue{
			{Key: RoleAttribute, Value: &protobufs.AnyValue{Value: &protobufs.AnyValue_StringValue{StringValue: RoleIngress}}},
		}},
		CustomCapabilities: &protobufs.CustomCapabilities{Capabilities: []string{ingestpolicy.Capability}},
	})
	require.NoError(t, err)
	// OpAMP over WebSocket: a zero varint header, then the message.
	require.NoError(t, conn.WriteMessage(websocket.BinaryMessage, append([]byte{0}, hello...)))
	received := make(chan []byte, 4)
	go func() {
		for {
			_, frame, err := conn.ReadMessage()
			if err != nil {
				return
			}
			msg := new(protobufs.ServerToAgent)
			if len(frame) == 0 || frame[0] != 0 || proto.Unmarshal(frame[1:], msg) != nil {
				continue
			}
			if m := msg.GetCustomMessage(); m.GetCapability() == ingestpolicy.Capability && m.GetType() == ingestpolicy.TypePolicy {
				received <- m.GetData()
			}
		}
	}()
	return received
}

// startOpAMP runs an opamp-go server with the backend's settings and its
// handshake gate in front of hub.
func startOpAMP(t *testing.T, hub *Hub, tokens *Tokens) string {
	t.Helper()
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	require.NoError(t, err)
	addr := listener.Addr().String()
	require.NoError(t, listener.Close())
	srv := server.New(nil)
	require.NoError(t, srv.Start(server.StartSettings{
		ListenEndpoint: addr,
		Settings: server.Settings{
			MaxMessageSize: MaxMessageSize,
			Callbacks: servertypes.Callbacks{
				OnConnecting: func(request *http.Request) servertypes.ConnectionResponse {
					authenticated := tokens.Verify(request.Header.Get("Authorization"))
					return servertypes.ConnectionResponse{Accept: true, ConnectionCallbacks: servertypes.ConnectionCallbacks{
						OnMessage: func(_ context.Context, conn servertypes.Connection, msg *protobufs.AgentToServer) *protobufs.ServerToAgent {
							if authenticated {
								hub.Observe(string(msg.GetInstanceUid()), conn, msg)
							}
							return &protobufs.ServerToAgent{InstanceUid: msg.GetInstanceUid()}
						},
						OnConnectionClose: func(conn servertypes.Connection) { hub.Remove(conn) },
					}}
				},
			},
		},
	}))
	t.Cleanup(func() { _ = srv.Stop(context.Background()) })
	return addr
}

func (hub *Hub) count() int {
	hub.mu.Lock()
	defer hub.mu.Unlock()
	return len(hub.agents)
}

// An agent that does not read cannot hold its sender, a send slot or the
// policy's copy: the write deadline on the network connection ends the
// send, and the agent is disconnected.
func TestPolicyWriteDeadline(t *testing.T) {
	tokens, err := LoadTokens(writeTokens(t, tokenA+"\n"))
	require.NoError(t, err)
	maxPolicy, err := ingestpolicytest.MaxPolicy(1)
	require.NoError(t, err)
	parsed, err := ingestpolicy.Parse(maxPolicy)
	require.NoError(t, err)
	publisher := NewPublisher(newTestStore(t), &fakeSource{content: &rumapplication.IngestContent{Keys: parsed.Keys, Applications: parsed.RUMApplications}}, slogDiscard())
	_, err = publisher.Revise(context.Background())
	require.NoError(t, err)
	hub := NewHub(publisher, slogDiscard())
	hub.sendTimeout = 500 * time.Millisecond
	t.Cleanup(hub.Close)
	addr := startOpAMP(t, hub, tokens)

	header := http.Header{"Authorization": {"Bearer " + tokenA}}
	conn, _, err := websocket.DefaultDialer.Dial("ws://"+addr+"/v1/opamp", header)
	require.NoError(t, err)
	t.Cleanup(func() { _ = conn.Close() })
	hello, err := proto.Marshal(&protobufs.AgentToServer{
		InstanceUid: []byte("0123456789abcdef"),
		AgentDescription: &protobufs.AgentDescription{NonIdentifyingAttributes: []*protobufs.KeyValue{
			{Key: RoleAttribute, Value: &protobufs.AnyValue{Value: &protobufs.AnyValue_StringValue{StringValue: RoleIngress}}},
		}},
		CustomCapabilities: &protobufs.CustomCapabilities{Capabilities: []string{ingestpolicy.Capability}},
	})
	require.NoError(t, err)
	require.NoError(t, conn.WriteMessage(websocket.BinaryMessage, append([]byte{0}, hello...)))
	// The client never reads, so the 18 MB write fills the socket buffers.
	require.Eventually(t, func() bool { return hub.count() == 1 }, 5*time.Second, time.Millisecond)
	require.Eventually(t, func() bool { return hub.count() == 0 }, 10*time.Second, 10*time.Millisecond, "disconnected at the deadline")
	assert.Empty(t, hub.sends, "the send slot is released")
}
