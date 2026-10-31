package implarchive

import (
	"sync"
	"testing"

	"github.com/ClickHouse/clickhouse-go/v2"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestResolveReplicas(t *testing.T) {
	dsnAddrs := []string{"clickhouse.internal:9440"}

	testCases := []struct {
		name    string
		rows    []clusterReplica
		want    map[int][]resolvedReplica
		wantErr bool
	}{
		{
			name: "LoopbackAddress_DSNAddr",
			rows: []clusterReplica{{shard: 1, replica: 1, host: "127.0.0.1", address: "127.0.0.1", port: 9000}},
			want: map[int][]resolvedReplica{1: {{replica: 1, addrs: dsnAddrs}}},
		},
		{
			name: "Localhost_DSNAddr",
			rows: []clusterReplica{{shard: 1, replica: 1, host: "localhost", address: "::1", port: 9000}},
			want: map[int][]resolvedReplica{1: {{replica: 1, addrs: dsnAddrs}}},
		},
		{
			name: "RemoteReplicas_HostAndPort",
			rows: []clusterReplica{{shard: 1, replica: 1, host: "ch-1", port: 9000}, {shard: 1, replica: 2, host: "ch-2", port: 9000}, {shard: 2, replica: 1, host: "ch-3", port: 9000}},
			want: map[int][]resolvedReplica{1: {{replica: 1, addrs: []string{"ch-1:9000"}}, {replica: 2, addrs: []string{"ch-2:9000"}}}, 2: {{replica: 1, addrs: []string{"ch-3:9000"}}}},
		},
		{
			name: "SameReplicaTwiceInAShard_Once",
			rows: []clusterReplica{{shard: 1, replica: 1, host: "ch-1", port: 9000}, {shard: 1, replica: 2, host: "ch-1", port: 9000}},
			want: map[int][]resolvedReplica{1: {{replica: 1, addrs: []string{"ch-1:9000"}}}},
		},
		{
			name:    "SameReplicaInTwoShards_Error",
			rows:    []clusterReplica{{shard: 1, replica: 1, host: "ch-1", port: 9000}, {shard: 2, replica: 1, host: "ch-1", port: 9000}},
			wantErr: true,
		},
		{
			name:    "LoopbackInTwoShards_Error",
			rows:    []clusterReplica{{shard: 1, replica: 1, host: "127.0.0.1", address: "127.0.0.1", port: 9000}, {shard: 2, replica: 1, host: "localhost", port: 9001}},
			wantErr: true,
		},
		{name: "NoReplicas_Error", wantErr: true},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			got, err := resolveReplicas(testCase.rows, dsnAddrs)
			if testCase.wantErr {
				assert.Error(t, err)
				return
			}
			require.NoError(t, err)
			assert.Equal(t, testCase.want, got)
		})
	}
}

func TestReplicaDialerConnect(t *testing.T) {
	dialer, err := newReplicaDialer("tcp://clickhouse:9000", 1)
	require.NoError(t, err)
	opened := make(map[string]*closeRecorder)
	dialer.open = func(options *clickhouse.Options) (clickhouse.Conn, error) {
		conn := &closeRecorder{}
		opened[options.Addr[0]] = conn
		return conn, nil
	}

	first, err := dialer.connect(map[int][]resolvedReplica{1: {{replica: 1, addrs: []string{"ch-1:9000"}}, {replica: 2, addrs: []string{"ch-2:9000"}}}})
	require.NoError(t, err)
	assert.Len(t, first[1], 2)

	second, err := dialer.connect(map[int][]resolvedReplica{1: {{replica: 1, addrs: []string{"ch-1:9000"}}}})
	require.NoError(t, err)

	assert.Equal(t, []replica{{shard: 1, replica: 1, addr: "ch-1:9000", conn: opened["ch-1:9000"]}}, second[1], "a replica still listed keeps its connection")
	assert.False(t, opened["ch-1:9000"].isClosed())
	assert.True(t, opened["ch-2:9000"].isClosed(), "a replica that left the cluster is disconnected")
	assert.NotContains(t, dialer.conns, "ch-2:9000")
}

type closeRecorder struct {
	clickhouse.Conn
	mu     sync.Mutex
	closed bool
}

func (conn *closeRecorder) Close() error {
	conn.mu.Lock()
	defer conn.mu.Unlock()
	conn.closed = true
	return nil
}

func (conn *closeRecorder) isClosed() bool {
	conn.mu.Lock()
	defer conn.mu.Unlock()
	return conn.closed
}
