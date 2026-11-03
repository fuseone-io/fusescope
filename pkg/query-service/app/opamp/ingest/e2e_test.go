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
