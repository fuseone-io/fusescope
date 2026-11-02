package clickhouseReader

import (
	"context"
	"database/sql"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/fuseone-io/fusescope/pkg/clickhousesql"
	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/types/archivetypes"
	"github.com/fuseone-io/fusescope/pkg/types/retentiontypes"
)

const mutationPollInterval = 5 * time.Second

// ApplyArchiveBackstop rewrites the TTL of the logs tables with a backstop of days, keeping
// their move rules, then materializes it on existing parts one table at a time, the small
// resource table first.
func (r *ClickHouseReader) ApplyArchiveBackstop(ctx context.Context, signal string, days int, progress archivetypes.BackstopProgress) error {
	if signal != retentiontypes.LogsTTL {
		return errors.Newf(errors.TypeUnsupported, errors.CodeUnsupported, "the archive backstop is only supported for logs, not %s", signal)
	}

	hasCustomRetention, err := r.hasCustomRetentionColumn(ctx)
	if err != nil {
		return errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "couldn't check the logs schema")
	}
	if !hasCustomRetention {
		return errors.New(errors.TypeUnsupported, errors.CodeUnsupported, "the archive needs the _retention_days column on the logs tables")
	}

	backstop, err := r.logsBackstop(ctx, days)
	if err != nil {
		return err
	}

	tables := r.logsTTLTables()
	applier := &backstopApplier{
		cluster:      r,
		progress:     progress,
		signal:       signal,
		days:         days,
		tables:       []string{tables.Resource, tables.Logs},
		clusterName:  r.cluster,
		pollInterval: mutationPollInterval,
		clause: func(table string, volume string, coldStorageDays int, _ int) retentiontypes.TTLClause {
			return customRetentionLogsTTLClauses(tables, volume, coldStorageDays, backstop)[table]
		},
	}

	return applier.apply(ctx)
}

// logsBackstop is the backstop of days for the logs tables. The logs table's ingestion
// column is used only once it exists.
func (r *ClickHouseReader) logsBackstop(ctx context.Context, days int) (logsBackstop, error) {
	if days == 0 {
		return logsBackstop{}, nil
	}

	hasCreatedAt, err := r.hasColumn(ctx, r.logsDB+"."+r.logsLocalTableV2, "created_at")
	if err != nil {
		return logsBackstop{}, err
	}
	if !hasCreatedAt {
		return logsBackstop{Days: days}, nil
	}

	return logsBackstop{Days: days, Ingestion: retentiontypes.DateTimeOf("created_at")}, nil
}

func (r *ClickHouseReader) logsTTLTables() logsTTLTables {
	return logsTTLTables{
		Logs:          r.logsDB + "." + r.logsLocalTableV2,
		Resource:      r.logsDB + "." + r.logsResourceLocalTableV2,
		AttributeKeys: getLocalTableName(r.logsDB + "." + r.logsAttributeKeys),
		ResourceKeys:  getLocalTableName(r.logsDB + "." + r.logsResourceKeys),
	}
}

// archiveBackstopDays is the backstop the TTL of the signal's tables must carry, 0 when it
// is not archived.
func (r *ClickHouseReader) archiveBackstopDays(ctx context.Context, signal string) (int, error) {
	state := new(archivetypes.Signal)
	err := r.sqlDB.BunDB().NewSelect().
		Model(state).
		Where("signal = ?", signal).
		Scan(ctx)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, nil
	}
	if err != nil {
		return 0, errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "couldn't read the archive state of %s", signal)
	}

	return state.BackstopDays, nil
}

func (r *ClickHouseReader) coldStorage(ctx context.Context, table string) (string, int, error) {
	volume, err := r.coldStorageVolume(ctx, table)
	if err != nil {
		return "", 0, err
	}
	days, err := r.coldStorageDays(ctx, table)
	if err != nil {
		return "", 0, err
	}

	return volume, days, nil
}

func (r *ClickHouseReader) coldStorageVolume(ctx context.Context, table string) (string, error) {
	database, name := splitTableName(table)

	var createTableQuery string
	err := r.db.QueryRow(ctx, "SELECT create_table_query FROM system.tables WHERE database = ? AND name = ?", database, name).Scan(&createTableQuery)
	if err != nil {
		return "", errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "couldn't read the definition of %s", table)
	}

	return retentiontypes.ColdStorageVolume(createTableQuery), nil
}

// coldStorageDays is the _retention_days_cold default SetTTLV2 wrote on table, 0 when unset.
func (r *ClickHouseReader) coldStorageDays(ctx context.Context, table string) (int, error) {
	database, name := splitTableName(table)

	var defaultExpression string
	err := r.db.QueryRow(ctx, "SELECT default_expression FROM system.columns WHERE database = ? AND table = ? AND name = '_retention_days_cold'", database, name).Scan(&defaultExpression)
	if err != nil {
		return 0, errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "couldn't read the cold-storage days of %s", table)
	}
	if defaultExpression == "" {
		return 0, nil
	}

	days, err := strconv.Atoi(defaultExpression)
	if err != nil {
		return 0, errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "unexpected cold-storage days %q on %s", defaultExpression, table)
	}

	return days, nil
}

func (r *ClickHouseReader) hasColumn(ctx context.Context, table string, column string) (bool, error) {
	database, name := splitTableName(table)

	var count uint64
	err := r.db.QueryRow(ctx, "SELECT count() FROM system.columns WHERE database = ? AND table = ? AND name = ?", database, name, column).Scan(&count)
	if err != nil {
		return false, errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "couldn't read the columns of %s", table)
	}

	return count > 0, nil
}

func (r *ClickHouseReader) mutations(ctx context.Context, table string) ([]retentiontypes.Mutation, error) {
	database, name := splitTableName(table)
	query := fmt.Sprintf("SELECT hostName(), mutation_id, command, create_time, is_done, latest_fail_reason FROM clusterAllReplicas(%s, system.mutations) WHERE database = ? AND table = ?", clickhousesql.StringLiteral(r.cluster))

	rows, err := r.db.Query(ctx, query, database, name)
	if err != nil {
		return nil, errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "couldn't read the mutations of %s", table)
	}
	defer rows.Close()

	var mutations []retentiontypes.Mutation
	for rows.Next() {
		var mutation retentiontypes.Mutation
		var done uint8
		if err := rows.Scan(&mutation.Host, &mutation.ID, &mutation.Command, &mutation.CreateTime, &done, &mutation.FailReason); err != nil {
			return nil, errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "couldn't read the mutations of %s", table)
		}
		mutation.Done = done == 1
		mutations = append(mutations, mutation)
	}

	return mutations, rows.Err()
}

func (r *ClickHouseReader) clusterHosts(ctx context.Context) ([]string, error) {
	rows, err := r.db.Query(ctx, fmt.Sprintf("SELECT DISTINCT hostName() FROM clusterAllReplicas(%s, system.one)", clickhousesql.StringLiteral(r.cluster)))
	if err != nil {
		return nil, errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "couldn't list the hosts of cluster %s", r.cluster)
	}
	defer rows.Close()

	var hosts []string
	for rows.Next() {
		var host string
		if err := rows.Scan(&host); err != nil {
			return nil, errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "couldn't list the hosts of cluster %s", r.cluster)
		}
		hosts = append(hosts, host)
	}

	return hosts, rows.Err()
}

func (r *ClickHouseReader) clusterNow(ctx context.Context) (time.Time, error) {
	var now time.Time
	if err := r.db.QueryRow(ctx, fmt.Sprintf("SELECT min(now()) FROM clusterAllReplicas(%s, system.one)", clickhousesql.StringLiteral(r.cluster))).Scan(&now); err != nil {
		return time.Time{}, errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "couldn't read the clock of cluster %s", r.cluster)
	}

	return now, nil
}

func (r *ClickHouseReader) exec(ctx context.Context, statement string) error {
	return r.db.Exec(ctx, statement)
}

func splitTableName(table string) (string, string) {
	database, name, _ := strings.Cut(table, ".")
	return database, name
}
