package clickhouseReader

import (
	"context"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/types/retentiontypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
)

// keptTTLTransactions is how many ttl_setting transactions survive deleteTtlTransactions.
const keptTTLTransactions = 100

// HasTTLSetting checks the table the TTL status of the settings page is read from. Once
// deleteTtlTransactions may have pruned the signal's rows, it is reported as set too.
func (r *ClickHouseReader) HasTTLSetting(ctx context.Context, ttlType string) (bool, error) {
	tableName, err := r.ttlStatusTableName(ttlType)
	if err != nil {
		return false, err
	}

	exists, err := r.sqlDB.BunDB().NewSelect().
		Model(new(retentiontypes.TTLSetting)).
		Where("table_name = ?", tableName).
		Exists(ctx)
	if err != nil {
		return false, errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "couldn't look up the ttl_setting of table %s", tableName)
	}
	if exists {
		return true, nil
	}

	var transactions int
	err = r.sqlDB.BunDB().NewSelect().
		Model(new(retentiontypes.TTLSetting)).
		ColumnExpr("COUNT(DISTINCT transaction_id)").
		Scan(ctx, &transactions)
	if err != nil {
		return false, errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "couldn't count the ttl_setting transactions")
	}

	return transactions >= keptTTLTransactions, nil
}

// SetDefaultTTL goes through SetTTLV2 for logs and SetTTL for traces and metrics, as the
// settings page does. ClickHouse is pinged first because SetTTL runs its ALTERs in the
// background and would record a failed status instead of returning an error.
func (r *ClickHouseReader) SetDefaultTTL(ctx context.Context, orgID valuer.UUID, ttlType string, days int) error {
	if _, err := r.ttlStatusTableName(ttlType); err != nil {
		return err
	}

	if err := r.db.Ping(ctx); err != nil {
		return errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "clickhouse is not reachable")
	}

	// The ALTERs outlive the caller, as they do for the settings page.
	ctx = context.WithoutCancel(ctx)

	if ttlType == retentiontypes.LogsTTL {
		_, err := r.SetTTLV2(ctx, orgID.StringValue(), retentiontypes.NewDefaultCustomRetentionTTLParams(days))
		return err
	}

	if _, apiErr := r.SetTTL(ctx, orgID.StringValue(), retentiontypes.NewDefaultTTLParams(ttlType, days)); apiErr != nil {
		return errors.Wrapf(apiErr.Err, errors.TypeInternal, errors.CodeInternal, "couldn't set the %s ttl", ttlType)
	}

	return nil
}

func (r *ClickHouseReader) ttlStatusTableName(ttlType string) (string, error) {
	switch ttlType {
	case retentiontypes.LogsTTL:
		return r.logsDB + "." + r.logsLocalTableV2, nil
	case retentiontypes.TraceTTL:
		return getLocalTableName(r.TraceDB + "." + r.traceTableName), nil
	case retentiontypes.MetricsTTL:
		return signozMetricDBName + "." + signozSampleLocalTableName, nil
	default:
		return "", errors.Newf(errors.TypeInvalidInput, errors.CodeInvalidInput, "unknown ttl type %q", ttlType)
	}
}
