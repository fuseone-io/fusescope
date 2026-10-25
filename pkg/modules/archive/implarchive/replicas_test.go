package implarchive

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestResolveReplicas(t *testing.T) {
	dsnAddrs := []string{"clickhouse.internal:9440"}

	testCases := []struct {
		name    string
		rows    []clusterReplica
		want    map[int][][]string
		wantErr bool
	}{
		{
			name: "LocalReplica_DSNAddr",
			rows: []clusterReplica{{shard: 1, host: "127.0.0.1", port: 9000, isLocal: true}},
			want: map[int][][]string{1: {dsnAddrs}},
		},
		{
			name: "RemoteReplicas_HostAndPort",
			rows: []clusterReplica{{shard: 1, host: "ch-1", port: 9000}, {shard: 1, host: "ch-2", port: 9000}, {shard: 2, host: "ch-3", port: 9000}},
			want: map[int][][]string{1: {{"ch-1:9000"}, {"ch-2:9000"}}, 2: {{"ch-3:9000"}}},
		},
		{
			name: "LoopbackNotLocal_HostAndPort",
			rows: []clusterReplica{{shard: 1, host: "localhost", port: 9001}},
			want: map[int][][]string{1: {{"localhost:9001"}}},
		},
		{
			name: "SameReplicaTwiceInAShard_Once",
			rows: []clusterReplica{{shard: 1, host: "ch-1", port: 9000}, {shard: 1, host: "ch-1", port: 9000}},
			want: map[int][][]string{1: {{"ch-1:9000"}}},
		},
		{
			name:    "SameReplicaInTwoShards_Error",
			rows:    []clusterReplica{{shard: 1, host: "ch-1", port: 9000}, {shard: 2, host: "ch-1", port: 9000}},
			wantErr: true,
		},
		{
			name:    "LocalReplicaInTwoShards_Error",
			rows:    []clusterReplica{{shard: 1, host: "ch-1", port: 9000, isLocal: true}, {shard: 2, host: "ch-2", port: 9000, isLocal: true}},
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
