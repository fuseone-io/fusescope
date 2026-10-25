package implarchive

import (
	"context"
	"testing"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2"
	"github.com/DATA-DOG/go-sqlmock"
	cmock "github.com/SigNoz/clickhouse-go-mock"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/factory"
	"github.com/fuseone-io/fusescope/pkg/instrumentation/instrumentationtest"
	"github.com/fuseone-io/fusescope/pkg/modules/archive"
	"github.com/fuseone-io/fusescope/pkg/types/archivetypes"
)

var (
	testLogsTable = archivetypes.Table{Database: "signoz_logs", Name: "logs_v2"}

	partColumns = []cmock.ColumnType{
		{Name: "partition_id", Type: "String"}, {Name: "name", Type: "String"}, {Name: "min_block_number", Type: "Int64"}, {Name: "max_block_number", Type: "Int64"},
		{Name: "data_version", Type: "Int64"}, {Name: "rows", Type: "UInt64"}, {Name: "modification_time", Type: "DateTime"},
	}
	statColumns = []cmock.ColumnType{
		{Name: "_file", Type: "String"}, {Name: "size", Type: "UInt64"}, {Name: "etag", Type: "String"}, {Name: "count", Type: "UInt64"}, {Name: "parts", Type: "Array(String)"},
	}
)

func TestSnapshotShard(t *testing.T) {
	ctx := context.Background()
	written := time.Date(2026, 9, 4, 0, 0, 0, 0, time.UTC)

	t.Run("ReplicaDown_LeftOut", func(t *testing.T) {
		service := newTestExportService(t, newTestStore(t))
		down, up := newMockConn(t), newMockConn(t)
		down.ExpectQuery("FROM system.parts").WithArgs(testLogsTable.Database, testLogsTable.Name).WillReturnError(errors.New(errors.TypeInternal, errors.CodeInternal, "connection refused"))
		expectParts(up, written, "20260903-15-0_1_5_1")
		expectReplicaPath(up, "/clickhouse/tables/u/01")

		snapshot, err := service.snapshotShard(ctx, testLogsTable, 1, []replica{{shard: 1, addr: "ch-1:9000", conn: asConn(down)}, {shard: 1, addr: "ch-2:9000", conn: asConn(up)}})
		require.NoError(t, err)

		assert.Equal(t, "ch-2:9000", snapshot.firstAddr)
		assert.Contains(t, snapshot.replicas, "ch-2:9000")
		assert.NotContains(t, snapshot.replicas, "ch-1:9000", "a replica down is left out, so ranges only it holds stay uncovered")
		assert.Equal(t, map[string]string{"20260903-15-0": "ch-2:9000"}, snapshot.partitionIDs)
		assert.Equal(t, written, snapshot.parts["ch-2:9000"]["20260903-15-0"][0].FirstSeen, "a part is first seen when it was written")
	})

	t.Run("NoReplicaAnswers_Error", func(t *testing.T) {
		service := newTestExportService(t, newTestStore(t))
		down := newMockConn(t)
		down.ExpectQuery("FROM system.parts").WithArgs(testLogsTable.Database, testLogsTable.Name).WillReturnError(errors.New(errors.TypeInternal, errors.CodeInternal, "connection refused"))

		_, err := service.snapshotShard(ctx, testLogsTable, 1, []replica{{shard: 1, addr: "ch-1:9000", conn: asConn(down)}})
		assert.Error(t, err)
	})

	t.Run("ShardNumberNamesOtherData_Refused", func(t *testing.T) {
		store := newTestStore(t)
		require.NoError(t, store.PinShard(ctx, testLogsTable.Name, 1, "/clickhouse/tables/u/01"))
		service := newTestExportService(t, store)
		conn := newMockConn(t)
		expectParts(conn, written, "20260903-15-0_1_5_1")
		expectReplicaPath(conn, "/clickhouse/tables/u/02")

		_, err := service.snapshotShard(ctx, testLogsTable, 1, []replica{{shard: 1, addr: "ch-1:9000", conn: asConn(conn)}})
		assert.True(t, errors.Asc(err, archivetypes.ErrCodeShardMismatch), err)
	})
}

func TestExport(t *testing.T) {
	ctx := context.Background()
	part := archivetypes.Part{Name: "20260903-15-0_1_5_1", Range: archivetypes.BlockRange{Min: 1, Max: 5}, DataVersion: 1, Rows: 10}

	testCases := []struct {
		name          string
		readBack      [][]any
		wantErr       bool
		wantPublished bool
	}{
		{name: "EveryRowReadBack_Published", readBack: [][]any{{part.Name + ".parquet", uint64(1024), `"etag"`, uint64(10), []string{part.Name}}}, wantPublished: true},
		{name: "RowsMissing_Abandoned", readBack: [][]any{{part.Name + ".parquet", uint64(1024), `"etag"`, uint64(9), []string{part.Name}}}, wantErr: true},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			archiveStore := newTestStore(t)
			service := newTestExportService(t, archiveStore)
			lease, err := archiveStore.AcquireLease(ctx, "logs", "a", time.Now().Add(time.Minute))
			require.NoError(t, err)

			conn := newMockConn(t)
			conn.ExpectExec("INSERT INTO FUNCTION s3")
			conn.ExpectQuery("groupUniqArray").WillReturnRows(cmock.NewRows(statColumns, testCase.readBack))
			if testCase.wantPublished {
				batch := conn.ExpectPrepareBatch("RawBLOB")
				batch.ExpectAppend()
				batch.ExpectSend()
			}

			job := exportJob{
				table:     testLogsTable,
				mappings:  []archivetypes.ColumnMapping{{Name: "body", SourceType: "String", ExportType: "String"}},
				version:   "1001",
				partition: archivetypes.Partition{ID: "20260903-15-0", Day: time.Date(2026, 9, 3, 0, 0, 0, 0, time.UTC), RetentionDays: 15},
				shard:     1,
				replicas:  map[string]replica{"ch-1:9000": {shard: 1, addr: "ch-1:9000", conn: asConn(conn)}},
				snapshot:  map[string][]archivetypes.Part{"ch-1:9000": {part}},
			}
			err = service.export(ctx, lease, job)

			published, listErr := archiveStore.ListPublishedParts(ctx, testLogsTable.Name, 1, job.partition.ID)
			require.NoError(t, listErr)
			var attempts []*archivetypes.Attempt
			require.NoError(t, archiveStore.(*store).sqlstore.BunDB().NewSelect().Model(&attempts).Scan(ctx))
			require.Len(t, attempts, 1)

			if testCase.wantErr {
				assert.True(t, errors.Asc(err, archivetypes.ErrCodeObjectMismatch), err)
				assert.Empty(t, published)
				assert.Equal(t, archivetypes.AttemptStatusAbandoned, attempts[0].Status, "an attempt that read back short is abandoned, its objects orphans")
				return
			}
			require.NoError(t, err)
			assert.Len(t, published, 1)
			assert.Equal(t, archivetypes.AttemptStatusPublished, attempts[0].Status)
			assert.True(t, service.staleIndexes[testLogsTable.Name], "the index is written once per table at the end of the cycle")
		})
	}
}

func TestHoldLateParts(t *testing.T) {
	service := newTestExportService(t, newTestStore(t))
	service.config.Logs.LateMinRows = 1_000
	service.config.Logs.LateMaxHold = 24 * time.Hour
	job := exportJob{table: testLogsTable, shard: 1, partition: archivetypes.Partition{ID: "20260903-15-0"}}
	late := archivetypes.Part{Name: "20260903-15-0_6_6_0", Range: archivetypes.BlockRange{Min: 6, Max: 6}, Rows: 1}

	written := late
	written.FirstSeen = time.Now().Add(-time.Hour)
	assert.Empty(t, service.holdLateParts(job, []archivetypes.Part{written}, true), "a late part written an hour ago is held")

	writtenLongAgo := late
	writtenLongAgo.FirstSeen = time.Now().Add(-25 * time.Hour)
	assert.Len(t, service.holdLateParts(job, []archivetypes.Part{writtenLongAgo}, true), 1, "the hold counts from when the part was written, not from when this backend saw it")

	merged := archivetypes.Part{Name: "20260903-15-0_6_7_1", Range: archivetypes.BlockRange{Min: 6, Max: 7}, Rows: 2, FirstSeen: time.Now()}
	assert.Len(t, service.holdLateParts(job, []archivetypes.Part{merged}, true), 1, "merging held parts keeps their earliest time")
}

func newTestExportService(t *testing.T, store archivetypes.Store) *exportService {
	t.Helper()

	config := archive.Config{Interval: time.Hour, Limits: archive.LimitsConfig{Concurrency: 1, MaxThreads: 1, RowGroupRows: 1000, QueryTimeout: time.Minute}}
	config.Logs = archive.SignalConfig{Enabled: true, NamedCollection: "archive", Prefix: "fusescope", BackstopDays: 7, LateMinRows: 2, LateMaxHold: time.Hour}

	return &exportService{
		settings:     factory.NewScopedProviderSettings(instrumentationtest.New().ToProviderSettings(), "implarchive_test"),
		store:        store,
		config:       config,
		holder:       "a",
		partitions:   make(map[string]archivetypes.Partition),
		firstSeen:    make(map[string][]archivetypes.Part),
		staleIndexes: make(map[string]bool),
	}
}

func newMockConn(t *testing.T) cmock.ClickConnMockCommon {
	t.Helper()

	conn, err := cmock.NewClickHouseWithQueryMatcher(&clickhouse.Options{}, sqlmock.QueryMatcherRegexp)
	require.NoError(t, err)
	t.Cleanup(func() { assert.NoError(t, conn.ExpectationsWereMet()) })
	return conn
}

func asConn(conn cmock.ClickConnMockCommon) clickhouse.Conn {
	return conn.(clickhouse.Conn)
}

func expectParts(conn cmock.ClickConnMockCommon, written time.Time, names ...string) {
	rows := make([][]any, 0, len(names))
	for i, name := range names {
		rows = append(rows, []any{"20260903-15-0", name, int64(i + 1), int64(i + 5), int64(1), uint64(10), written})
	}
	conn.ExpectQuery("FROM system.parts").WithArgs(testLogsTable.Database, testLogsTable.Name).WillReturnRows(cmock.NewRows(partColumns, rows))
}

func expectReplicaPath(conn cmock.ClickConnMockCommon, path string) {
	conn.ExpectQueryRow("FROM system.replicas").WillReturnRow(cmock.NewRow([]cmock.ColumnType{{Name: "zookeeper_path", Type: "String"}}, []any{path}))
}
