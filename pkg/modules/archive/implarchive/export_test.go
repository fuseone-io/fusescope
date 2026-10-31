package implarchive

import (
	"context"
	"fmt"
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
	"github.com/fuseone-io/fusescope/pkg/telemetrystore"
	"github.com/fuseone-io/fusescope/pkg/telemetrystore/telemetrystoretest"
	"github.com/fuseone-io/fusescope/pkg/types/archivetypes"
)

var (
	testLogsTable = archivetypes.Table{Database: "signoz_logs", Name: "logs_v2"}

	partColumns = []cmock.ColumnType{
		{Name: "partition_id", Type: "String"}, {Name: "name", Type: "String"}, {Name: "min_block_number", Type: "Int64"}, {Name: "max_block_number", Type: "Int64"},
		{Name: "data_version", Type: "Int64"}, {Name: "rows", Type: "UInt64"}, {Name: "bytes_on_disk", Type: "UInt64"}, {Name: "modification_time", Type: "DateTime"},
	}
	statColumns = []cmock.ColumnType{
		{Name: "_file", Type: "String"}, {Name: "size", Type: "UInt64"}, {Name: "etag", Type: "String"}, {Name: "count", Type: "UInt64"}, {Name: "parts", Type: "Array(String)"},
	}
)

func TestSnapshotShard(t *testing.T) {
	ctx := context.Background()
	written := time.Date(2026, 9, 4, 0, 0, 0, 0, time.UTC)
	down := func(t *testing.T) cmock.ClickConnMockCommon {
		conn := newMockConn(t)
		conn.ExpectQueryRow("FROM system.clusters").WillReturnRow(cmock.NewRow(nil, nil)).WillReturnError(errors.New(errors.TypeInternal, errors.CodeInternal, "connection refused"))
		return conn
	}

	testCases := []struct {
		name         string
		replicas     func(t *testing.T) []cmock.ClickConnMockCommon
		wantErr      bool
		wantAddrs    []string
		wantIdentity string
		replicated   bool
	}{
		{
			name: "ReplicaDown_LeftOut",
			replicas: func(t *testing.T) []cmock.ClickConnMockCommon {
				up := newMockConn(t)
				expectReplica(up, 1, "ReplicatedMergeTree", "/clickhouse/tables/u/01")
				expectParts(up, written, "20260903-15-0_1_5_1")
				return []cmock.ClickConnMockCommon{down(t), up}
			},
			wantAddrs:    []string{"ch-2:9000"},
			wantIdentity: "/clickhouse/tables/u/01",
			replicated:   true,
		},
		{
			name: "ConnectionReachesAnotherServer_LeftOut",
			replicas: func(t *testing.T) []cmock.ClickConnMockCommon {
				elsewhere, up := newMockConn(t), newMockConn(t)
				expectReplica(elsewhere, 0, "ReplicatedMergeTree", "/clickhouse/tables/u/02")
				expectReplica(up, 1, "ReplicatedMergeTree", "/clickhouse/tables/u/01")
				expectParts(up, written, "20260903-15-0_1_5_1")
				return []cmock.ClickConnMockCommon{elsewhere, up}
			},
			wantAddrs:    []string{"ch-2:9000"},
			wantIdentity: "/clickhouse/tables/u/01",
			replicated:   true,
		},
		{
			name: "TableMissingOnAReplica_LeftOut",
			replicas: func(t *testing.T) []cmock.ClickConnMockCommon {
				fresh, up := newMockConn(t), newMockConn(t)
				expectReplica(fresh, 1, "", "")
				expectReplica(up, 1, "ReplicatedMergeTree", "/clickhouse/tables/u/01")
				expectParts(up, written, "20260903-15-0_1_5_1")
				return []cmock.ClickConnMockCommon{fresh, up}
			},
			wantAddrs:    []string{"ch-2:9000"},
			wantIdentity: "/clickhouse/tables/u/01",
			replicated:   true,
		},
		{
			name: "ReplicasDisagreeOnPath_Error",
			replicas: func(t *testing.T) []cmock.ClickConnMockCommon {
				first, second := newMockConn(t), newMockConn(t)
				expectReplica(first, 1, "ReplicatedMergeTree", "/clickhouse/tables/u/01")
				expectParts(first, written, "20260903-15-0_1_5_1")
				expectReplica(second, 1, "ReplicatedMergeTree", "/clickhouse/tables/v/01")
				expectParts(second, written, "20260903-15-0_1_5_1")
				return []cmock.ClickConnMockCommon{first, second}
			},
			wantErr: true,
		},
		{
			name: "NotReplicated_TableUUID",
			replicas: func(t *testing.T) []cmock.ClickConnMockCommon {
				up := newMockConn(t)
				expectReplica(up, 1, "MergeTree", "")
				expectParts(up, written, "20260903-15-0_1_5_1")
				return []cmock.ClickConnMockCommon{up}
			},
			wantAddrs:    []string{"ch-1:9000"},
			wantIdentity: "uuid:6f1c1b9e-0000-4000-8000-000000000001",
		},
		{
			name:     "NoReplicaAnswers_Error",
			replicas: func(t *testing.T) []cmock.ClickConnMockCommon { return []cmock.ClickConnMockCommon{down(t)} },
			wantErr:  true,
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			service := newTestExportService(t, newTestStore(t))
			var shardReplicas []replica
			for i, conn := range testCase.replicas(t) {
				shardReplicas = append(shardReplicas, replica{shard: 1, replica: i + 1, addr: fmt.Sprintf("ch-%d:9000", i+1), conn: asConn(conn)})
			}

			snapshot, err := service.snapshotShard(ctx, testLogsTable, 1, shardReplicas)
			if testCase.wantErr {
				assert.Error(t, err)
				return
			}
			require.NoError(t, err)

			addrs := make([]string, 0, len(snapshot.replicas))
			for addr := range snapshot.replicas {
				addrs = append(addrs, addr)
			}
			assert.ElementsMatch(t, testCase.wantAddrs, addrs, "a replica that isn't the expected server with the table is left out, so ranges only it holds stay uncovered")
			assert.Equal(t, testCase.wantIdentity, snapshot.identity)
			assert.Equal(t, testCase.replicated, snapshot.replicated)
			assert.Equal(t, written, snapshot.parts[testCase.wantAddrs[0]]["20260903-15-0"][0].FirstSeen, "a part is first seen when it was written")
		})
	}
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

			pin, err := archiveStore.PinShard(ctx, testLogsTable.Name, 1, "/clickhouse/tables/u/01")
			require.NoError(t, err)

			conn := newMockConn(t)
			conn.ExpectExec("INSERT INTO FUNCTION s3")
			conn.ExpectQuery("groupUniqArray").WillReturnRows(cmock.NewRows(statColumns, testCase.readBack))
			if testCase.wantPublished {
				conn.ExpectExec("SELECT raw FROM blob")
			}

			job := exportJob{
				table:     testLogsTable,
				mappings:  []archivetypes.ColumnMapping{{Name: "body", SourceType: "String", ExportType: "String"}},
				version:   "1001",
				partition: archivetypes.Partition{ID: "20260903-15-0", Day: time.Date(2026, 9, 3, 0, 0, 0, 0, time.UTC), RetentionDays: 15},
				shard:     1,
				pin:       pin,
				replicas:  map[string]replica{"ch-1:9000": {shard: 1, addr: "ch-1:9000", conn: asConn(conn)}},
				snapshot:  map[string][]archivetypes.Part{"ch-1:9000": {part}},
			}
			err = service.export(ctx, lease, job)

			published, listErr := archiveStore.ListPublishedParts(ctx, pin, job.partition.ID)
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

	config := archive.Config{Interval: time.Hour, Limits: archive.LimitsConfig{Concurrency: 1, MaxThreads: 1, RowGroupRows: 1000, QueryTimeout: time.Minute, QueryTimeoutPerGiB: time.Minute}}
	config.Logs = archive.SignalConfig{Enabled: true, NamedCollection: "archive", Prefix: "fusescope", BackstopDays: 7, LateMinRows: 2, LateMaxHold: time.Hour}

	return &exportService{
		settings:       factory.NewScopedProviderSettings(instrumentationtest.New().ToProviderSettings(), "implarchive_test"),
		telemetryStore: telemetrystoretest.New(telemetrystore.Config{}, sqlmock.QueryMatcherRegexp),
		store:          store,
		config:         config,
		holder:         "a",
		partitions:     make(map[string]archivetypes.Partition),
		firstSeen:      make(map[string][]archivetypes.Part),
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
		rows = append(rows, []any{"20260903-15-0", name, int64(i + 1), int64(i + 5), int64(1), uint64(10), uint64(2048), written})
	}
	conn.ExpectQuery("FROM system.parts").WithArgs(testLogsTable.Database, testLogsTable.Name).WillReturnRows(cmock.NewRows(partColumns, rows))
}

func expectReplica(conn cmock.ClickConnMockCommon, isReplica uint64, engine string, path string) {
	conn.ExpectQueryRow("FROM system.clusters").WillReturnRow(cmock.NewRow([]cmock.ColumnType{{Name: "is_replica", Type: "UInt64"}, {Name: "engine", Type: "String"}, {Name: "uuid", Type: "String"}, {Name: "zookeeper_path", Type: "String"}}, []any{isReplica, engine, "6f1c1b9e-0000-4000-8000-000000000001", path}))
}
