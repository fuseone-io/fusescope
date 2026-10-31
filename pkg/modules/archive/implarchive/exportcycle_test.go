package implarchive

import (
	"context"
	"testing"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2"
	cmock "github.com/SigNoz/clickhouse-go-mock"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/telemetrystore/telemetrystoretest"
	"github.com/fuseone-io/fusescope/pkg/types/archivetypes"
)

var (
	testResourceTable = archivetypes.Table{Database: "signoz_logs", Name: "logs_v2_resource"}
	exportedPart      = archivetypes.Part{Name: "20260903-15-0_1_5_1", Range: archivetypes.BlockRange{Min: 1, Max: 5}, DataVersion: 1, Rows: 10}
)

func TestJobs(t *testing.T) {
	ctx := context.Background()
	written := time.Date(2026, 9, 4, 0, 0, 0, 0, time.UTC)

	t.Run("TwoShards_JobsPerShardAndShardsPinned", func(t *testing.T) {
		archiveStore := newTestStore(t)
		service := newTestExportService(t, archiveStore)
		first, second := newMockConn(t), newMockConn(t)
		expectReplica(first, 1, "ReplicatedMergeTree", "/clickhouse/tables/u/01")
		expectParts(first, written, "20260903-15-0_1_5_1")
		expectColumnsAndVersion(first, testLogsTable)
		expectPartition(first)
		expectReplica(second, 1, "ReplicatedMergeTree", "/clickhouse/tables/u/02")
		expectParts(second, written, "20260903-15-0_1_3_1")

		jobs, _, err := service.jobs(ctx, testLogsTable, map[int][]replica{
			1: {{shard: 1, replica: 1, addr: "ch-1:9000", conn: asConn(first)}},
			2: {{shard: 2, replica: 1, addr: "ch-2:9000", conn: asConn(second)}},
		})
		require.NoError(t, err)

		require.Len(t, jobs, 2)
		assert.ElementsMatch(t, []int{1, 2}, []int{jobs[0].shard, jobs[1].shard})
		_, err = archiveStore.PinShard(ctx, testLogsTable.Name, 1, "/clickhouse/tables/u/02")
		assert.True(t, errors.Asc(err, archivetypes.ErrCodeShardMismatch), "each shard is pinned to its replica path")
		assert.NotEqual(t, jobs[0].pin.ID, jobs[1].pin.ID)
	})

	t.Run("NotReplicatedOnOneServer_PinnedToTableUUID", func(t *testing.T) {
		archiveStore := newTestStore(t)
		service := newTestExportService(t, archiveStore)
		conn := newMockConn(t)
		expectReplica(conn, 1, "MergeTree", "")
		expectParts(conn, written, "20260903-15-0_1_5_1")
		expectColumnsAndVersion(conn, testLogsTable)
		expectPartition(conn)

		jobs, _, err := service.jobs(ctx, testLogsTable, map[int][]replica{1: {{shard: 1, replica: 1, addr: "ch-1:9000", conn: asConn(conn)}}})
		require.NoError(t, err)

		require.Len(t, jobs, 1)
		assert.Equal(t, "uuid:6f1c1b9e-0000-4000-8000-000000000001", jobs[0].pin.ReplicaPath, "a recreated table gets a new UUID, so a new pin")
	})

	t.Run("NotReplicatedOnTwoShards_Error", func(t *testing.T) {
		service := newTestExportService(t, newTestStore(t))
		first, second := newMockConn(t), newMockConn(t)
		expectReplica(first, 1, "MergeTree", "")
		expectParts(first, written, "20260903-15-0_1_5_1")

		_, _, err := service.jobs(ctx, testLogsTable, map[int][]replica{
			1: {{shard: 1, replica: 1, addr: "ch-1:9000", conn: asConn(first)}},
			2: {{shard: 2, replica: 1, addr: "ch-2:9000", conn: asConn(second)}},
		})
		assert.Error(t, err, "shards of a table that isn't replicated can't be told apart")
	})

	t.Run("ShardNumberNamesOtherData_ShardSkipped", func(t *testing.T) {
		archiveStore := newTestStore(t)
		_, err := archiveStore.PinShard(ctx, testLogsTable.Name, 1, "/clickhouse/tables/u/01")
		require.NoError(t, err)
		service := newTestExportService(t, archiveStore)
		conn := newMockConn(t)
		expectReplica(conn, 1, "ReplicatedMergeTree", "/clickhouse/tables/u/02")
		expectParts(conn, written, "20260903-15-0_1_5_1")

		_, _, err = service.jobs(ctx, testLogsTable, map[int][]replica{1: {{shard: 1, replica: 1, addr: "ch-1:9000", conn: asConn(conn)}}})
		assert.Error(t, err)
	})
}

func TestExportTables(t *testing.T) {
	ctx := context.Background()
	archiveStore := newTestStore(t)
	lease, err := archiveStore.AcquireLease(ctx, "logs", "a", time.Now().Add(time.Minute))
	require.NoError(t, err)
	require.NoError(t, archiveStore.Publish(ctx, lease, newTestPublicationOf(t, archiveStore, lease, "20260903-15-0", exportedPart)))

	service := newTestExportService(t, archiveStore)
	service.telemetryStore.(*telemetrystoretest.Provider).Mock().ExpectQuery("FROM system.clusters").WithArgs("cluster").WillReturnRows(cmock.NewRows(
		[]cmock.ColumnType{{Name: "shard_num", Type: "UInt32"}, {Name: "replica_num", Type: "UInt32"}, {Name: "host_name", Type: "String"}, {Name: "host_address", Type: "String"}, {Name: "port", Type: "UInt16"}},
		[][]any{{uint32(1), uint32(1), "ch-1", "10.0.0.1", uint16(9000)}},
	))

	conn := newMockConn(t)
	for _, table := range []archivetypes.Table{testLogsTable, testResourceTable} {
		expectReplica(conn, 1, "ReplicatedMergeTree", "/clickhouse/tables/"+table.Name+"/01")
		conn.ExpectQuery("FROM system.parts").WithArgs(table.Database, table.Name).WillReturnRows(cmock.NewRows(partColumns, nil))
		expectColumnsAndVersion(conn, table)
	}
	expectIndexes(conn, testLogsTable)
	conn.ExpectExec(`index/0+1-0+1\.json.*SELECT raw FROM blob`)
	expectIndexes(conn, testResourceTable)

	var dialed []string
	service.dialer, err = newReplicaDialer("tcp://clickhouse-lb:9000", 1)
	require.NoError(t, err)
	service.dialer.open = func(options *clickhouse.Options) (clickhouse.Conn, error) {
		dialed = append(dialed, options.Addr...)
		return asConn(conn), nil
	}

	require.NoError(t, service.exportTables(ctx, lease))
	assert.Equal(t, []string{"ch-1:9000"}, dialed, "replicas are dialed at their cluster address, never through the DSN's load balancer")
}

func TestSyncIndex(t *testing.T) {
	ctx := context.Background()

	testCases := []struct {
		name      string
		published bool
		indexes   []string
		listErr   bool
		wantWrite bool
	}{
		{name: "IndexBehindTheStore_Written", published: true, indexes: []string{"00000000000000000001-00000000000000000000.json"}, wantWrite: true},
		{name: "NoIndexAfterALostCycle_Written", published: true, wantWrite: true},
		{name: "IndexCurrent_Skipped", published: true, indexes: []string{"00000000000000000003-00000000000000000001.json"}},
		{name: "NothingPublished_Skipped"},
		{name: "IndexesUnreadable_Written", published: true, listErr: true, wantWrite: true},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			archiveStore := newTestStore(t)
			lease, err := archiveStore.AcquireLease(ctx, "logs", "a", time.Now().Add(time.Minute))
			require.NoError(t, err)
			if testCase.published {
				require.NoError(t, archiveStore.Publish(ctx, lease, newTestPublicationOf(t, archiveStore, lease, "20260903-15-0", exportedPart)))
			}
			service := newTestExportService(t, archiveStore)

			conn := newMockConn(t)
			if testCase.listErr {
				conn.ExpectQuery("format = 'One'").WillReturnError(errors.New(errors.TypeInternal, errors.CodeInternal, "access denied"))
			} else {
				expectIndexes(conn, testLogsTable, testCase.indexes...)
			}
			if testCase.wantWrite {
				conn.ExpectExec(`index/0+1-0+1\.json.*SELECT raw FROM blob`)
			}

			service.syncIndex(ctx, asConn(conn), lease, testLogsTable)
		})
	}
}

func TestPartTimeout(t *testing.T) {
	service := newTestExportService(t, newTestStore(t))
	service.config.Limits.QueryTimeout = time.Hour
	service.config.Limits.QueryTimeoutPerGiB = 2 * time.Minute

	testCases := []struct {
		name  string
		bytes uint64
		want  time.Duration
	}{
		{name: "SmallPart_QueryTimeout", bytes: 10 << 20, want: time.Hour + 2*time.Minute},
		{name: "EmptyPart_QueryTimeout", want: time.Hour},
		{name: "LargePart_GrowsWithSize", bytes: 150 << 30, want: time.Hour + 300*time.Minute},
		{name: "HugePart_BoundByTheCycle", bytes: 10 << 40, want: service.config.Logs.CycleTimeout()},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			assert.Equal(t, testCase.want, service.partTimeout(archivetypes.Part{BytesOnDisk: testCase.bytes}))
		})
	}
}

func TestQuerySettingsExecutionTime(t *testing.T) {
	testCases := []struct {
		name    string
		timeout time.Duration
		want    int
	}{
		{name: "WholeSeconds", timeout: time.Hour, want: 3600},
		{name: "SubSecond_OneSecond", timeout: 300 * time.Millisecond, want: 1},
		{name: "Fraction_RoundedUp", timeout: 1500 * time.Millisecond, want: 2},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			assert.Equal(t, testCase.want, querySettings(0, 1, 1000, testCase.timeout)["max_execution_time"])
		})
	}
}

func expectColumnsAndVersion(conn cmock.ClickConnMockCommon, table archivetypes.Table) {
	conn.ExpectQuery("FROM system.columns").WithArgs(table.Database, table.Name).WillReturnRows(cmock.NewRows([]cmock.ColumnType{{Name: "name", Type: "String"}, {Name: "type", Type: "String"}}, [][]any{{"body", "String"}}))
	conn.ExpectQueryRow("schema_migrations_v2").WillReturnRow(cmock.NewRow([]cmock.ColumnType{{Name: "version", Type: "String"}}, []any{"1001"}))
}

func expectPartition(conn cmock.ClickConnMockCommon) {
	conn.ExpectQueryRow("_partition_value").WillReturnRow(cmock.NewRow([]cmock.ColumnType{{Name: "day", Type: "Date"}, {Name: "retention", Type: "UInt32"}}, []any{time.Date(2026, 9, 3, 0, 0, 0, 0, time.UTC), uint32(15)}))
}

func expectIndexes(conn cmock.ClickConnMockCommon, table archivetypes.Table, names ...string) {
	rows := make([][]any, 0, len(names))
	for _, name := range names {
		rows = append(rows, []any{name})
	}
	conn.ExpectQuery(table.Name + `/index/\*\.json`).WillReturnRows(cmock.NewRows([]cmock.ColumnType{{Name: "_file", Type: "String"}}, rows))
}
