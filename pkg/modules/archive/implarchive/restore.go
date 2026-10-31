package implarchive

import (
	"context"
	"database/sql"
	"fmt"
	"log/slog"
	"strings"

	"github.com/ClickHouse/clickhouse-go/v2"
	"github.com/fuseone-io/fusescope/pkg/clickhousesql"
	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/modules/archive"
	"github.com/fuseone-io/fusescope/pkg/telemetryschema/logstelemetryschema"
	"github.com/fuseone-io/fusescope/pkg/telemetrystore"
	"github.com/fuseone-io/fusescope/pkg/types/archivetypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
)

// restoreSet is the tables a signal needs restored together, each with the Distributed
// table that reads it.
type restoreSet struct {
	database string
	tables   []restoreTable
}

type restoreTable struct {
	local       string
	distributed string
}

type restorer struct {
	telemetryStore telemetrystore.TelemetryStore
	store          archivetypes.Store
	limits         archive.LimitsConfig
	logger         *slog.Logger
}

var logsRestoreSet = restoreSet{
	database: logstelemetryschema.DBName,
	tables: []restoreTable{
		{local: logstelemetryschema.LogsV2LocalTableName, distributed: logstelemetryschema.LogsV2TableName},
		{local: "logs_v2_resource", distributed: logstelemetryschema.LogsResourceV2TableName},
	},
}

// Restore loads rehydration from the objects SQL lists, after checking each against its
// commit, into the rehydrated_* tables. A failure leaves none of its rows behind; a
// cancelled context leaves it loading, to retry from scratch.
func (restorer *restorer) Restore(ctx context.Context, rehydration *archivetypes.Rehydration) error {
	rehydration.Status, rehydration.FailureReason, rehydration.FailureMessage = archivetypes.RehydrationStatusLoading, "", ""
	if err := restorer.store.UpdateRehydration(ctx, rehydration); err != nil {
		return err
	}

	err := restorer.load(ctx, logsRestoreSet, rehydration)
	if err == nil {
		rehydration.Status = archivetypes.RehydrationStatusReady
		return restorer.store.UpdateRehydration(ctx, rehydration)
	}
	if ctx.Err() != nil {
		return err
	}

	if dropErr := restorer.dropRehydration(ctx, logsRestoreSet, rehydration.ID); dropErr != nil {
		restorer.logger.WarnContext(ctx, "couldn't drop the rows of a failed restoration", slog.String("rehydration_id", rehydration.ID.StringValue()), errors.Attr(dropErr))
	}
	rehydration.Status, rehydration.FailureReason, rehydration.FailureMessage = archivetypes.RehydrationStatusFailed, archivetypes.FailureReasonOf(err), err.Error()
	if updateErr := restorer.store.UpdateRehydration(ctx, rehydration); updateErr != nil {
		return updateErr
	}
	restorer.logger.WarnContext(ctx, "restoration failed", slog.String("rehydration_id", rehydration.ID.StringValue()), slog.String("reason", rehydration.FailureReason), errors.Attr(err))
	return nil
}

func (restorer *restorer) load(ctx context.Context, set restoreSet, rehydration *archivetypes.Rehydration) error {
	plan, err := restorer.plan(ctx, set, rehydration)
	if err != nil {
		return err
	}
	if err := restorer.verify(ctx, set, plan); err != nil {
		return err
	}

	ddl, columns, err := restorer.ensureTables(ctx, set)
	if err != nil {
		return err
	}
	rehydration.DDL = strings.Join(ddl, ";\n")
	// A retry starts from scratch, so it can't duplicate rows.
	if err := restorer.dropRehydration(ctx, set, rehydration.ID); err != nil {
		return err
	}

	rehydration.Bytes, rehydration.Rows = 0, 0
	for _, table := range set.tables {
		for _, part := range plan[table.local] {
			if err := restorer.insert(ctx, set.database, table, columns[table.local], rehydration, part); err != nil {
				return err
			}
			rehydration.Bytes += part.Object.Bytes
			rehydration.Rows += part.Part.Rows
		}
	}

	return nil
}

func (restorer *restorer) plan(ctx context.Context, set restoreSet, rehydration *archivetypes.Rehydration) (map[string][]archivetypes.RestorablePart, error) {
	tables := make([]string, len(set.tables))
	var parts []archivetypes.RestorablePart
	for i, table := range set.tables {
		tables[i] = table.local
		for _, day := range rehydration.Days() {
			found, err := restorer.store.ListRestorableParts(ctx, table.local, day)
			if err != nil {
				return nil, err
			}
			parts = append(parts, found...)
		}
	}

	return archivetypes.RestorePlan(tables, parts)
}

// verify compares every object's size and ETag, and every manifest's SHA-256, with what
// was committed, before anything is loaded.
func (restorer *restorer) verify(ctx context.Context, set restoreSet, plan map[string][]archivetypes.RestorablePart) error {
	ctx = clickhouse.Context(ctx, clickhouse.WithSettings(clickhouse.Settings{"s3_ignore_file_doesnt_exist": 1}))
	manifests := map[valuer.UUID]bool{}

	for _, table := range set.tables {
		for _, part := range plan[table.local] {
			if err := restorer.verifyObject(ctx, part.Object); err != nil {
				return err
			}
			if manifests[part.Attempt.ID] {
				continue
			}
			if err := restorer.verifyManifest(ctx, part.Attempt); err != nil {
				return err
			}
			manifests[part.Attempt.ID] = true
		}
	}

	return nil
}

func (restorer *restorer) verifyObject(ctx context.Context, object *archivetypes.Object) error {
	source, err := s3Source(object.NamedCollection, object.ObjectKey, "format = 'One'")
	if err != nil {
		return err
	}

	var size int64
	var etag string
	err = restorer.telemetryStore.ClickhouseDB().QueryRow(ctx, "SELECT toInt64(ifNull(_size, 0)), toString(_etag) FROM "+source).Scan(&size, &etag)
	if errors.Is(err, sql.ErrNoRows) {
		return errors.Newf(errors.TypeInvalidInput, archivetypes.ErrCodeRehydrationCorrupt, "archived object %s is missing", object.ObjectKey)
	}
	if err != nil {
		return errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "couldn't check archived object %s", object.ObjectKey)
	}
	if size != object.Bytes || strings.Trim(etag, `"`) != object.ETag {
		return errors.Newf(errors.TypeInvalidInput, archivetypes.ErrCodeRehydrationCorrupt, "archived object %s has %d bytes and ETag %s, its commit %d bytes and ETag %s", object.ObjectKey, size, etag, object.Bytes, object.ETag)
	}

	return nil
}

func (restorer *restorer) verifyManifest(ctx context.Context, attempt *archivetypes.Attempt) error {
	source, err := s3Source(attempt.NamedCollection, attempt.ManifestKey, "format = 'RawBLOB', structure = 'raw String'")
	if err != nil {
		return err
	}

	var sum string
	err = restorer.telemetryStore.ClickhouseDB().QueryRow(ctx, "SELECT lower(hex(SHA256(raw))) FROM "+source).Scan(&sum)
	if errors.Is(err, sql.ErrNoRows) {
		return errors.Newf(errors.TypeInvalidInput, archivetypes.ErrCodeRehydrationCorrupt, "the manifest %s of archive attempt %s is missing", attempt.ManifestKey, attempt.ID)
	}
	if err != nil {
		return errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "couldn't check the manifest %s", attempt.ManifestKey)
	}
	if sum != attempt.ManifestSHA256 {
		return errors.Newf(errors.TypeInvalidInput, archivetypes.ErrCodeRehydrationCorrupt, "the manifest %s of archive attempt %s changed since its commit", attempt.ManifestKey, attempt.ID)
	}

	return nil
}

// insert loads one object, casting each archived column back to its source type.
func (restorer *restorer) insert(ctx context.Context, database string, table restoreTable, target []archivetypes.SchemaColumn, rehydration *archivetypes.Rehydration, part archivetypes.RestorablePart) error {
	mappings, err := part.Attempt.ColumnMappings()
	if err != nil {
		return err
	}
	columns, expressions, err := archivetypes.RestoreExpressions(mappings, target)
	if err != nil {
		return errors.Wrapf(err, errors.TypeUnsupported, archivetypes.ErrCodeRehydrationIncompat, "couldn't map archived object %s to %s", part.Object.ObjectKey, table.local)
	}
	source, err := s3Source(part.Object.NamedCollection, part.Object.ObjectKey, "format = 'Parquet'")
	if err != nil {
		return err
	}

	columns = append(columns, clickhousesql.Identifier(archivetypes.RehydrationIDColumn), clickhousesql.Identifier(archivetypes.ExpiresAtColumn))
	expressions = append(expressions, "toUUID("+clickhousesql.StringLiteral(rehydration.ID.StringValue())+")", fmt.Sprintf("toDateTime(%d)", rehydration.ExpiresAt.Unix()))
	statement := fmt.Sprintf("INSERT INTO %s.%s (%s) SELECT %s FROM %s", clickhousesql.Identifier(database), clickhousesql.Identifier(archivetypes.RehydratedTableName(table.distributed)), strings.Join(columns, ", "), strings.Join(expressions, ", "), source)

	if err := restorer.telemetryStore.ClickhouseDB().Exec(clickhouse.Context(ctx, clickhouse.WithSettings(restorer.settings())), statement); err != nil {
		return errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "couldn't restore archived object %s", part.Object.ObjectKey)
	}
	return nil
}

func (restorer *restorer) settings() clickhouse.Settings {
	settings := clickhouse.Settings{
		"max_threads":                   restorer.limits.MaxThreads,
		"max_insert_threads":            restorer.limits.MaxThreads,
		"distributed_foreground_insert": 1,
	}
	if restorer.limits.MaxMemoryUsage > 0 {
		settings["max_memory_usage"] = restorer.limits.MaxMemoryUsage
	}
	return settings
}

// s3Source reads one key: s3() expands globs, so a key holding one could read objects
// that were never committed.
func s3Source(namedCollection string, key string, arguments string) (string, error) {
	if strings.ContainsAny(key, "*?{}") {
		return "", errors.Newf(errors.TypeInvalidInput, archivetypes.ErrCodeRehydrationCorrupt, "archived key %s holds a glob", key)
	}
	return fmt.Sprintf("s3(%s, filename = %s, %s)", clickhousesql.Identifier(namedCollection), clickhousesql.StringLiteral(key), arguments), nil
}
