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
		{Name: "has_lightweight_delete", Type: "UInt8"},
	}
	partsQueryPattern = `has_lightweight_delete FROM system\.parts`
	statColumns       = []cmock.ColumnType{
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
	part := archivetypes.Part{Name: "20260903-15-0_1_5_1", Range: archivetypes.BlockRange{Min: 1, Max: 5}, DataVersion: 1, Rows: 10, BytesOnDisk: 2048}
	merged := archivetypes.Part{Name: "20260903-15-0_1_6_2", Range: archivetypes.BlockRange{Min: 1, Max: 6}, DataVersion: 1, Rows: 12, BytesOnDisk: 2048}
	behind := archivetypes.Part{Name: "20260903-15-0_1_3_0", Range: archivetypes.BlockRange{Min: 1, Max: 3}, DataVersion: 1, Rows: 6, BytesOnDisk: 2048}
	deleted := archivetypes.Part{Name: "20260903-15-0_1_5_1_2", Range: archivetypes.BlockRange{Min: 1, Max: 5}, DataVersion: 2, Rows: 10, BytesOnDisk: 2048, LightweightDeleted: true}
	next := archivetypes.Part{Name: "20260903-15-0_6_8_1", Range: archivetypes.BlockRange{Min: 6, Max: 8}, DataVersion: 6, Rows: 7, BytesOnDisk: 2048}
	readBackOf := func(part archivetypes.Part, rows uint64) [][]any {
		return [][]any{{part.Name + ".parquet", uint64(1024), `"etag"`, rows, []string{part.Name}}}
	}

	testCases := []struct {
		name          string
		replicaParts  [][]archivetypes.Part
		exportedBy    int
		existingRows  *uint64
		readBacks     [][][]any
		wantErr       bool
		wantPublished []string
	}{
		{name: "EveryRowReadBack_Published", replicaParts: [][]archivetypes.Part{{part}}, readBacks: [][][]any{readBackOf(part, 10)}, wantPublished: []string{part.Name}},
		{name: "RowsMissing_Abandoned", replicaParts: [][]archivetypes.Part{{part}}, readBacks: [][][]any{readBackOf(part, 9)}, wantErr: true, wantPublished: []string{}},
		{name: "MergedSinceTheCycleStarted_MergedPartExported", replicaParts: [][]archivetypes.Part{{merged}}, readBacks: [][][]any{readBackOf(merged, 12)}, wantPublished: []string{merged.Name}},
		{name: "ReplicaFallenBehind_OtherReplicaExports", replicaParts: [][]archivetypes.Part{{behind}, {part}}, exportedBy: 1, readBacks: [][][]any{readBackOf(part, 10)}, wantPublished: []string{part.Name}},
		{name: "PartsOverTheByteCap_OneCommitEach", replicaParts: [][]archivetypes.Part{{part, next}}, readBacks: [][][]any{readBackOf(part, 10), readBackOf(next, 7)}, wantPublished: []string{part.Name, next.Name}},
		{name: "LightweightDelete_ExistingRowsCounted", replicaParts: [][]archivetypes.Part{{deleted}}, existingRows: ptr(uint64(9)), readBacks: [][][]any{readBackOf(deleted, 9)}, wantPublished: []string{deleted.Name}},
		{name: "EveryRowDeleted_NotExported", replicaParts: [][]archivetypes.Part{{deleted}}, existingRows: ptr(uint64(0)), wantPublished: []string{}},
		{name: "SecondAttemptFails_FirstStaysPublished", replicaParts: [][]archivetypes.Part{{part, next}}, readBacks: [][][]any{readBackOf(part, 10), readBackOf(next, 6)}, wantErr: true, wantPublished: []string{part.Name}},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			archiveStore := newTestStore(t)
			service := newTestExportService(t, archiveStore)
			lease, err := archiveStore.AcquireLease(ctx, "logs", "a", time.Now().Add(time.Minute))
			require.NoError(t, err)

			pin, err := archiveStore.PinShard(ctx, testLogsTable.Name, 1, "/clickhouse/tables/u/01")
			require.NoError(t, err)

			job := exportJob{
				table:     testLogsTable,
				mappings:  []archivetypes.ColumnMapping{{Name: "body", SourceType: "String", ExportType: "String"}},
				version:   "1001",
				partition: archivetypes.Partition{ID: "20260903-15-0", Day: time.Date(2026, 9, 3, 0, 0, 0, 0, time.UTC), RetentionDays: 15},
				shard:     1,
				pin:       pin,
				replicas:  map[string]replica{},
			}
			conns := make([]cmock.ClickConnMockCommon, len(testCase.replicaParts))
			for i, parts := range testCase.replicaParts {
				conns[i] = newMockConn(t)
				addr := fmt.Sprintf("ch-%d:9000", i+1)
				job.replicas[addr] = replica{shard: 1, replica: i + 1, addr: addr, conn: asConn(conns[i])}
				expectPartitionParts(conns[i], job.partition.ID, parts...)
			}

			exporter := conns[testCase.exportedBy]
			if testCase.existingRows != nil {
				exporter.ExpectQueryRow(`SELECT count\(\) FROM .* WHERE _part = \?`).WillReturnRow(cmock.NewRow([]cmock.ColumnType{{Name: "count", Type: "UInt64"}}, []any{*testCase.existingRows}))
			}
			for i, readBack := range testCase.readBacks {
				for range readBack {
					exporter.ExpectExec("INSERT INTO FUNCTION s3")
				}
				exporter.ExpectQuery("groupUniqArray").WillReturnRows(cmock.NewRows(statColumns, readBack))
				if testCase.wantErr && i == len(testCase.readBacks)-1 {
					break
				}
				exporter.ExpectExec("SELECT raw FROM blob")
				for i, parts := range testCase.replicaParts {
					expectPartitionParts(conns[i], job.partition.ID, parts...)
				}
			}

			err = service.export(ctx, lease, job)

			published, listErr := archiveStore.ListPublishedParts(ctx, pin, job.partition.ID)
			require.NoError(t, listErr)
			var attempts []*archivetypes.Attempt
			require.NoError(t, archiveStore.(*store).sqlstore.BunDB().NewSelect().Model(&attempts).Scan(ctx))
			require.Len(t, attempts, len(testCase.readBacks), "an attempt exports at most max_attempt_bytes")
			statuses := map[string]int{}
			for _, attempt := range attempts {
				statuses[attempt.Status]++
			}

			assert.Equal(t, testCase.wantPublished, partNames(published), "the parts are read when the job runs, not when the cycle started")
			if testCase.existingRows != nil && len(published) > 0 {
				assert.Equal(t, int64(*testCase.existingRows), published[0].Rows, "rows a lightweight delete masked are neither exported nor counted")
			}
			if testCase.wantErr {
				assert.True(t, errors.Asc(err, archivetypes.ErrCodeObjectMismatch), err)
				assert.Equal(t, 1, statuses[archivetypes.AttemptStatusAbandoned], "an attempt that read back short is abandoned, its objects orphans")
				assert.Equal(t, len(testCase.readBacks)-1, statuses[archivetypes.AttemptStatusPublished], "the attempts before it stay published")
				return
			}
			require.NoError(t, err)
			assert.Equal(t, len(testCase.readBacks), statuses[archivetypes.AttemptStatusPublished])
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

	config := archive.Config{Interval: time.Hour, Limits: archive.LimitsConfig{Concurrency: 1, MaxThreads: 1, RowGroupRows: 1000, QueryTimeout: time.Minute, QueryTimeoutPerGiB: time.Minute, MaxAttemptBytes: 3000}}
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
		rows = append(rows, []any{"20260903-15-0", name, int64(i + 1), int64(i + 5), int64(1), uint64(10), uint64(2048), written, uint8(0)})
	}
	conn.ExpectQuery(partsQueryPattern).WithArgs(testLogsTable.Database, testLogsTable.Name).WillReturnRows(cmock.NewRows(partColumns, rows))
}

func expectPartitionParts(conn cmock.ClickConnMockCommon, partitionID string, parts ...archivetypes.Part) {
	rows := make([][]any, 0, len(parts))
	for _, part := range parts {
		rows = append(rows, []any{partitionID, part.Name, part.Range.Min, part.Range.Max, part.DataVersion, part.Rows, part.BytesOnDisk, time.Date(2026, 9, 4, 0, 0, 0, 0, time.UTC), map[bool]uint8{true: 1}[part.LightweightDeleted]})
	}
	conn.ExpectQuery(partsQueryPattern+`.*AND partition_id = \?`).WithArgs(testLogsTable.Database, testLogsTable.Name, partitionID).WillReturnRows(cmock.NewRows(partColumns, rows))
}

func expectReplica(conn cmock.ClickConnMockCommon, isReplica uint64, engine string, path string) {
	conn.ExpectQueryRow("FROM system.clusters").WillReturnRow(cmock.NewRow([]cmock.ColumnType{{Name: "is_replica", Type: "UInt64"}, {Name: "engine", Type: "String"}, {Name: "uuid", Type: "String"}, {Name: "zookeeper_path", Type: "String"}}, []any{isReplica, engine, "6f1c1b9e-0000-4000-8000-000000000001", path}))
}

func ptr[T any](value T) *T {
	return &value
}
