package implarchive

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2"
	"github.com/fuseone-io/fusescope/pkg/clickhousesql"
	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/types/archivetypes"
)

// activeParts returns the replica's active parts of table that hold rows, by partition ID. A
// part is first seen when it was written, so a hold survives restarts and handovers.
func activeParts(ctx context.Context, conn clickhouse.Conn, table archivetypes.Table) (map[string][]archivetypes.Part, error) {
	rows, err := conn.Query(ctx, "SELECT partition_id, name, min_block_number, max_block_number, toInt64(data_version), rows, modification_time FROM system.parts WHERE database = ? AND table = ? AND active AND rows > 0 ORDER BY partition_id, min_block_number", table.Database, table.Name)
	if err != nil {
		return nil, errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "couldn't list the parts of %s.%s", table.Database, table.Name)
	}
	defer rows.Close()

	parts := make(map[string][]archivetypes.Part)
	for rows.Next() {
		var partitionID string
		var part archivetypes.Part
		if err := rows.Scan(&partitionID, &part.Name, &part.Range.Min, &part.Range.Max, &part.DataVersion, &part.Rows, &part.FirstSeen); err != nil {
			return nil, errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "couldn't read the parts of %s.%s", table.Database, table.Name)
		}
		parts[partitionID] = append(parts[partitionID], part)
	}

	return parts, rows.Err()
}

func readPartition(ctx context.Context, conn clickhouse.Conn, table archivetypes.Table, partitionID string) (archivetypes.Partition, error) {
	partition := archivetypes.Partition{ID: partitionID}
	var retention uint32
	query := fmt.Sprintf("SELECT toDate(_partition_value.1), toUInt32(_partition_value.2) FROM %s.%s WHERE _partition_id = ? LIMIT 1", clickhousesql.Identifier(table.Database), clickhousesql.Identifier(table.Name))
	if err := conn.QueryRow(ctx, query, partitionID).Scan(&partition.Day, &retention); err != nil {
		return partition, errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "couldn't read the day and retention of %s.%s partition %s", table.Database, table.Name, partitionID)
	}
	partition.Day = partition.Day.UTC()
	partition.RetentionDays = int(retention)

	return partition, nil
}

// exportedColumns leaves out the columns a SELECT can't or needn't read back.
func exportedColumns(ctx context.Context, conn clickhouse.Conn, table archivetypes.Table) ([]archivetypes.Column, error) {
	rows, err := conn.Query(ctx, "SELECT name, type FROM system.columns WHERE database = ? AND table = ? AND default_kind NOT IN ('ALIAS', 'EPHEMERAL') ORDER BY position", table.Database, table.Name)
	if err != nil {
		return nil, errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "couldn't list the columns of %s.%s", table.Database, table.Name)
	}
	defer rows.Close()

	var columns []archivetypes.Column
	for rows.Next() {
		var column archivetypes.Column
		if err := rows.Scan(&column.Name, &column.Type); err != nil {
			return nil, errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "couldn't read the columns of %s.%s", table.Database, table.Name)
		}
		columns = append(columns, column)
	}

	return columns, rows.Err()
}

// schemaVersion is the latest migration the collector's migrator finished on database.
func schemaVersion(ctx context.Context, conn clickhouse.Conn, database string) (string, error) {
	var version string
	query := fmt.Sprintf("SELECT toString(max(migration_id)) FROM %s.schema_migrations_v2 WHERE status = 'finished'", clickhousesql.Identifier(database))
	if err := conn.QueryRow(ctx, query).Scan(&version); err != nil {
		return "", errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "couldn't read the schema version of %s", database)
	}

	return version, nil
}

func statObjects(ctx context.Context, conn clickhouse.Conn, namedCollection string, dir string) ([]archivetypes.ObjectStat, error) {
	rows, err := conn.Query(ctx, archivetypes.StatObjectsStatement(namedCollection, dir))
	if err != nil {
		return nil, errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "couldn't read back the objects under %s", dir)
	}
	defer rows.Close()

	var stats []archivetypes.ObjectStat
	for rows.Next() {
		var stat archivetypes.ObjectStat
		var size, count uint64
		if err := rows.Scan(&stat.File, &size, &stat.ETag, &count, &stat.Parts); err != nil {
			return nil, errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "couldn't read back the objects under %s", dir)
		}
		stat.Bytes, stat.Rows = int64(size), int64(count)
		stats = append(stats, stat)
	}

	return stats, rows.Err()
}

// replicaPath is the replica path of table on the server, "" when it isn't replicated.
func replicaPath(ctx context.Context, conn clickhouse.Conn, table archivetypes.Table) (string, error) {
	var path string
	err := conn.QueryRow(ctx, "SELECT zookeeper_path FROM system.replicas WHERE database = ? AND table = ?", table.Database, table.Name).Scan(&path)
	if errors.Is(err, sql.ErrNoRows) {
		return "", nil
	}
	if err != nil {
		return "", errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "couldn't read the replica path of %s.%s", table.Database, table.Name)
	}

	return path, nil
}

func writeBlob(ctx context.Context, conn clickhouse.Conn, namedCollection string, key string, content []byte) error {
	batch, err := conn.PrepareBatch(ctx, archivetypes.WriteBlobStatement(namedCollection, key))
	if err != nil {
		return errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "couldn't write %s", key)
	}
	if err := batch.Append(string(content)); err != nil {
		return errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "couldn't write %s", key)
	}
	if err := batch.Send(); err != nil {
		return errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "couldn't write %s", key)
	}

	return nil
}

// withQuerySettings bounds the query by timeout on the client too, so a stuck one can't hold
// the cycle while its lease is renewed.
func withQuerySettings(ctx context.Context, settings clickhouse.Settings, timeout time.Duration, queryID string) (context.Context, context.CancelFunc) {
	ctx, cancel := context.WithTimeout(ctx, timeout)
	return clickhouse.Context(ctx, clickhouse.WithSettings(settings), clickhouse.WithQueryID(queryID)), cancel
}

func querySettings(maxMemoryUsage int64, maxThreads int, rowGroupRows int, timeout time.Duration) clickhouse.Settings {
	settings := clickhouse.Settings{
		"max_execution_time":                   int(timeout.Seconds()),
		"max_threads":                          maxThreads,
		"output_format_parquet_row_group_size": rowGroupRows,
		"s3_truncate_on_insert":                0,
		"s3_create_new_file_on_insert":         0,
	}
	if maxMemoryUsage > 0 {
		settings["max_memory_usage"] = maxMemoryUsage
	}
	return settings
}

func queryID(attemptID string, step string) string {
	return fmt.Sprintf("archive-%s-%s-%d", attemptID, step, time.Now().UnixNano())
}
