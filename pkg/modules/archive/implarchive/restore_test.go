package implarchive

import (
	"context"
	"database/sql"
	"regexp"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	cmock "github.com/SigNoz/clickhouse-go-mock"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/factory/factorytest"
	"github.com/fuseone-io/fusescope/pkg/modules/archive"
	"github.com/fuseone-io/fusescope/pkg/telemetrystore"
	"github.com/fuseone-io/fusescope/pkg/telemetrystore/telemetrystoretest"
	"github.com/fuseone-io/fusescope/pkg/types/archivetypes"
)

var (
	tableSchemaColumns  = []cmock.ColumnType{{Name: "name", Type: "String"}, {Name: "engine", Type: "String"}, {Name: "engine_full", Type: "String"}, {Name: "sorting_key", Type: "String"}, {Name: "primary_key", Type: "String"}}
	columnSchemaColumns = []cmock.ColumnType{{Name: "table", Type: "String"}, {Name: "name", Type: "String"}, {Name: "type", Type: "String"}, {Name: "default_kind", Type: "String"}, {Name: "default_expression", Type: "String"}, {Name: "compression_codec", Type: "String"}, {Name: "comment", Type: "String"}}
	allRestoreTables    = []string{"logs_v2", "distributed_logs_v2", "rehydrated_logs_v2", "rehydrated_distributed_logs_v2", "logs_v2_resource", "distributed_logs_v2_resource", "rehydrated_logs_v2_resource", "rehydrated_distributed_logs_v2_resource"}
	rehydratedLocals    = []string{"rehydrated_logs_v2", "rehydrated_logs_v2_resource"}
)

func TestRestore(t *testing.T) {
	testCases := []struct {
		name       string
		noResource bool
		expect     func(mock cmock.ClickConnMockCommon, published map[string]*archivetypes.Publication)
		status     string
		reason     string
		rows       int64
	}{
		{
			name: "LoadsInBlockOrderAfterChecks",
			expect: func(mock cmock.ClickConnMockCommon, published map[string]*archivetypes.Publication) {
				expectChecks(mock, published, "logs_v2", "etag", "sha")
				expectChecks(mock, published, "logs_v2_resource", "etag", "sha")
				expectLiveSchemas(mock)
				for _, table := range []string{"`rehydrated_logs_v2` ON CLUSTER `cluster` (", "`rehydrated_distributed_logs_v2` ON CLUSTER `cluster` AS", "`rehydrated_logs_v2_resource` ON CLUSTER `cluster` (", "`rehydrated_distributed_logs_v2_resource` ON CLUSTER `cluster` AS"} {
					mock.ExpectExec(regexp.QuoteMeta("CREATE TABLE IF NOT EXISTS `signoz_logs`." + table))
				}
				expectDropPartitions(mock)
				mock.ExpectExec(regexp.QuoteMeta("INSERT INTO `signoz_logs`.`rehydrated_distributed_logs_v2` (`timestamp`, `rehydration_id`, `expires_at`) SELECT CAST(`timestamp`, 'UInt64'), toUUID(") + ".*" + regexp.QuoteMeta("FROM s3(`archive`, filename = '"+published["logs_v2"].Objects[1].ObjectKey+"', format = 'Parquet')"))
				mock.ExpectExec(regexp.QuoteMeta("INSERT INTO `signoz_logs`.`rehydrated_distributed_logs_v2` (`timestamp`") + ".*" + regexp.QuoteMeta(published["logs_v2"].Objects[0].ObjectKey))
				mock.ExpectExec(regexp.QuoteMeta("INSERT INTO `signoz_logs`.`rehydrated_distributed_logs_v2_resource` (`labels`, `rehydration_id`, `expires_at`) SELECT `labels`, toUUID("))
			},
			status: archivetypes.RehydrationStatusReady,
			rows:   30,
		},
		{
			name: "ObjectReplaced_CorruptAndNothingLoaded",
			expect: func(mock cmock.ClickConnMockCommon, published map[string]*archivetypes.Publication) {
				mock.ExpectQueryRow(regexp.QuoteMeta(published["logs_v2"].Objects[1].ObjectKey)).WillReturnRow(cmock.NewRow(sizeEtagColumns(), []any{int64(1024), `"other"`}))
				expectNoRehydratedTables(mock)
			},
			status: archivetypes.RehydrationStatusFailed,
			reason: archivetypes.FailureCorrupt,
		},
		{
			name: "ObjectMissing_Corrupt",
			expect: func(mock cmock.ClickConnMockCommon, published map[string]*archivetypes.Publication) {
				mock.ExpectQueryRow(regexp.QuoteMeta(published["logs_v2"].Objects[1].ObjectKey)).WillReturnRow(cmock.NewRow(sizeEtagColumns(), []any{int64(0), ""})).WillReturnError(sql.ErrNoRows)
				expectNoRehydratedTables(mock)
			},
			status: archivetypes.RehydrationStatusFailed,
			reason: archivetypes.FailureCorrupt,
		},
		{
			name: "ManifestEdited_CorruptAndRetriedRowsDropped",
			expect: func(mock cmock.ClickConnMockCommon, published map[string]*archivetypes.Publication) {
				expectChecks(mock, published, "logs_v2", "etag", "edited")
				expectDropPartitions(mock)
			},
			status: archivetypes.RehydrationStatusFailed,
			reason: archivetypes.FailureCorrupt,
		},
		{
			name:       "ResourceNotArchived_Incomplete",
			noResource: true,
			expect: func(mock cmock.ClickConnMockCommon, _ map[string]*archivetypes.Publication) {
				expectNoRehydratedTables(mock)
			},
			status: archivetypes.RehydrationStatusFailed,
			reason: archivetypes.FailureIncomplete,
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			ctx := context.Background()
			store := newTestStore(t)
			lease := acquireTestLease(t, store)
			published := map[string]*archivetypes.Publication{
				"logs_v2": publishTestTable(t, store, lease, "logs_v2", "timestamp", archivetypes.BlockRange{Min: 4, Max: 5}, archivetypes.BlockRange{Min: 1, Max: 3}),
			}
			if !testCase.noResource {
				published["logs_v2_resource"] = publishTestTable(t, store, lease, "logs_v2_resource", "labels", archivetypes.BlockRange{Min: 1, Max: 1})
			}

			telemetryStore := telemetrystoretest.New(telemetrystore.Config{}, sqlmock.QueryMatcherRegexp)
			testCase.expect(telemetryStore.Mock(), published)
			restorer := &restorer{telemetryStore: telemetryStore, store: store, limits: archive.LimitsConfig{MaxThreads: 2}, logger: factorytest.NewSettings().Logger}

			rehydration, err := archivetypes.NewRehydration("logs", time.Date(2026, 9, 3, 0, 0, 0, 0, time.UTC), time.Hour, "admin@example.com")
			require.NoError(t, err)
			require.NoError(t, store.CreateRehydration(ctx, rehydration))

			require.NoError(t, restorer.Restore(ctx, rehydration))
			assert.NoError(t, telemetryStore.Mock().ExpectationsWereMet())

			stored, err := store.GetRehydration(ctx, rehydration.ID)
			require.NoError(t, err)
			assert.Equal(t, testCase.status, stored.Status, stored.FailureMessage)
			assert.Equal(t, testCase.reason, stored.FailureReason)
			assert.Equal(t, testCase.rows, stored.Rows)
			if testCase.status == archivetypes.RehydrationStatusReady {
				assert.Contains(t, stored.DDL, "CREATE TABLE IF NOT EXISTS `signoz_logs`.`rehydrated_logs_v2`")
			}
		})
	}
}

func TestRestorePendingLoadsEveryRestoration(t *testing.T) {
	ctx := context.Background()
	store := newTestStore(t)
	telemetryStore := telemetrystoretest.New(telemetrystore.Config{}, sqlmock.QueryMatcherRegexp)
	service := NewRestoreService(factorytest.NewSettings(), telemetryStore, store, archive.Config{Interval: time.Hour, Limits: archive.LimitsConfig{MaxThreads: 1}}).(*restoreService)

	require.NoError(t, service.restorePending(ctx), "nothing pending")

	for _, day := range []int{3, 4} {
		rehydration, err := archivetypes.NewRehydration("logs", time.Date(2026, 9, day, 0, 0, 0, 0, time.UTC), time.Hour, "admin@example.com")
		require.NoError(t, err)
		require.NoError(t, store.CreateRehydration(ctx, rehydration))
		expectNoRehydratedTables(telemetryStore.Mock())
	}

	require.NoError(t, service.restorePending(ctx))
	assert.NoError(t, telemetryStore.Mock().ExpectationsWereMet())
	_, err := store.NextRehydration(ctx, "logs")
	assert.True(t, errors.Asc(err, archivetypes.ErrCodeRehydrationNotFound), "both restorations of unarchived days end, failed as incomplete: %v", err)
}

// publishTestTable publishes one part of table per range, on 2026-09-03, each in its own
// object with 1024 bytes and ETag "etag", under a manifest whose SHA-256 is "sha".
func publishTestTable(t *testing.T, store archivetypes.Store, lease *archivetypes.Lease, table string, column string, ranges ...archivetypes.BlockRange) *archivetypes.Publication {
	t.Helper()
	ctx := context.Background()

	attempt := archivetypes.NewExportAttempt(lease, table, 1, "20260903-15-0", "archive", "fusescope")
	require.NoError(t, store.CreateAttempt(ctx, attempt))
	location := archivetypes.ObjectLocation{Prefix: "fusescope", Table: table, Day: time.Date(2026, 9, 3, 0, 0, 0, 0, time.UTC), Shard: 1, PartitionID: "20260903-15-0", AttemptID: attempt.ID.StringValue()}
	mapping := archivetypes.ColumnMapping{Name: column, SourceType: "String", ExportType: "String"}
	if column == "timestamp" {
		mapping = archivetypes.ColumnMapping{Name: column, SourceType: "UInt64", ExportType: "Int64", UInt64Rule: archivetypes.UInt64RuleBits}
	}
	require.NoError(t, attempt.SetFormat([]archivetypes.ColumnMapping{mapping}, location.ManifestKey(), "sha"))

	publication := &archivetypes.Publication{Attempt: attempt}
	for _, blocks := range ranges {
		part := testPart(blocks)
		object := archivetypes.NewObject(attempt, location.ObjectKey(part.Name), 1024, "etag", int64(part.Rows))
		publication.Objects = append(publication.Objects, object)
		publication.Parts = append(publication.Parts, archivetypes.NewArchivedPart(attempt, object, part))
	}
	require.NoError(t, store.Publish(ctx, lease, publication))
	return publication
}

// expectChecks expects the object checks of table's parts in block order, its manifest
// checked once after the first. A manifest sum other than "sha" ends the checks there.
func expectChecks(mock cmock.ClickConnMockCommon, published map[string]*archivetypes.Publication, table string, etag string, sum string) {
	publication := published[table]
	objects := publication.Objects
	if table == "logs_v2" {
		objects = []*archivetypes.Object{objects[1], objects[0]}
	}
	for i, object := range objects {
		mock.ExpectQueryRow(regexp.QuoteMeta("SELECT toInt64(ifNull(_size, 0)), toString(_etag) FROM s3(`archive`, filename = '" + object.ObjectKey + "', format = 'One')")).WillReturnRow(cmock.NewRow(sizeEtagColumns(), []any{int64(1024), `"` + etag + `"`}))
		if i == 0 {
			mock.ExpectQueryRow(regexp.QuoteMeta("SELECT lower(hex(SHA256(raw))) FROM s3(`archive`, filename = '" + publication.Attempt.ManifestKey + "', format = 'RawBLOB'")).WillReturnRow(cmock.NewRow([]cmock.ColumnType{{Name: "sum", Type: "String"}}, []any{sum}))
			if sum != "sha" {
				return
			}
		}
	}
}

func expectLiveSchemas(mock cmock.ClickConnMockCommon) {
	mock.ExpectQuery(regexp.QuoteMeta(tableSchemasQuery)).WithArgs("signoz_logs", allRestoreTables).WillReturnRows(cmock.NewRows(tableSchemaColumns, [][]any{
		{"logs_v2", "MergeTree", "MergeTree ORDER BY timestamp TTL now()", "timestamp", "timestamp"},
		{"distributed_logs_v2", "Distributed", "Distributed('cluster', 'signoz_logs', 'logs_v2', rand())", "", ""},
		{"logs_v2_resource", "ReplacingMergeTree", "ReplacingMergeTree ORDER BY labels", "labels", "labels"},
		{"distributed_logs_v2_resource", "Distributed", "Distributed('cluster', 'signoz_logs', 'logs_v2_resource', rand())", "", ""},
	}))
	mock.ExpectQuery(regexp.QuoteMeta(columnSchemasQuery)).WithArgs("signoz_logs", allRestoreTables).WillReturnRows(cmock.NewRows(columnSchemaColumns, [][]any{
		{"logs_v2", "timestamp", "UInt64", "", "", "", ""},
		{"logs_v2_resource", "labels", "String", "", "", "", ""},
	}))
}

func expectDropPartitions(mock cmock.ClickConnMockCommon) {
	mock.ExpectQuery(regexp.QuoteMeta(tableSchemasQuery)).WithArgs("signoz_logs", rehydratedLocals).WillReturnRows(cmock.NewRows(tableSchemaColumns, [][]any{
		{"rehydrated_logs_v2", "MergeTree", "MergeTree", "timestamp", "timestamp"},
		{"rehydrated_logs_v2_resource", "ReplacingMergeTree", "ReplacingMergeTree", "labels", "labels"},
	}))
	mock.ExpectQuery(regexp.QuoteMeta(columnSchemasQuery)).WithArgs("signoz_logs", rehydratedLocals).WillReturnRows(cmock.NewRows(columnSchemaColumns, nil))
	mock.ExpectExec(regexp.QuoteMeta("ALTER TABLE `signoz_logs`.`rehydrated_logs_v2` ON CLUSTER `cluster` DROP PARTITION '"))
	mock.ExpectExec(regexp.QuoteMeta("ALTER TABLE `signoz_logs`.`rehydrated_logs_v2_resource` ON CLUSTER `cluster` DROP PARTITION '"))
}

func expectNoRehydratedTables(mock cmock.ClickConnMockCommon) {
	mock.ExpectQuery(regexp.QuoteMeta(tableSchemasQuery)).WithArgs("signoz_logs", rehydratedLocals).WillReturnRows(cmock.NewRows(tableSchemaColumns, nil))
	mock.ExpectQuery(regexp.QuoteMeta(columnSchemasQuery)).WithArgs("signoz_logs", rehydratedLocals).WillReturnRows(cmock.NewRows(columnSchemaColumns, nil))
}

func sizeEtagColumns() []cmock.ColumnType {
	return []cmock.ColumnType{{Name: "size", Type: "Int64"}, {Name: "etag", Type: "String"}}
}
