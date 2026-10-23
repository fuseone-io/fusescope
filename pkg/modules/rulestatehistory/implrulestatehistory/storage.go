package implrulestatehistory

import (
	"context"
	"fmt"

	"github.com/fuseone-io/fusescope/pkg/clickhousesql"
	"github.com/fuseone-io/fusescope/pkg/querybuilder"
	"github.com/fuseone-io/fusescope/pkg/telemetryschema/chschema"
	qbtypes "github.com/fuseone-io/fusescope/pkg/types/querybuildertypes/querybuildertypesv5"
	"github.com/fuseone-io/fusescope/pkg/types/telemetrytypes"
	"github.com/huandu/go-sqlbuilder"
)

var ruleStateHistoryColumns = map[string]*chschema.Column{
	"rule_id":               {Name: "rule_id", Type: chschema.ColumnTypeString},
	"rule_name":             {Name: "rule_name", Type: chschema.ColumnTypeString},
	"overall_state":         {Name: "overall_state", Type: chschema.ColumnTypeString},
	"overall_state_changed": {Name: "overall_state_changed", Type: chschema.ColumnTypeBool},
	"state":                 {Name: "state", Type: chschema.ColumnTypeString},
	"state_changed":         {Name: "state_changed", Type: chschema.ColumnTypeBool},
	"unix_milli":            {Name: "unix_milli", Type: chschema.ColumnTypeInt64},
	"labels":                {Name: "labels", Type: chschema.ColumnTypeString},
	"fingerprint":           {Name: "fingerprint", Type: chschema.ColumnTypeUInt64},
	"value":                 {Name: "value", Type: chschema.ColumnTypeFloat64},
}

type storage struct{}

var _ qbtypes.Storage = (*storage)(nil)

func newStorage() *storage {
	return &storage{}
}

func (m *storage) getColumn(_ context.Context, key *telemetrytypes.TelemetryFieldKey) (*chschema.Column, error) { //nolint:unparam
	if col, ok := ruleStateHistoryColumns[key.Name]; ok {
		return col, nil
	}
	return ruleStateHistoryColumns["labels"], nil
}

func (m *storage) read(ctx context.Context, _ qbtypes.QueryInfo, key *telemetrytypes.TelemetryFieldKey) (string, error) {
	col, err := m.getColumn(ctx, key)
	if err != nil {
		return "", err
	}
	if col.Name == "labels" && key.Name != "labels" {
		return fmt.Sprintf("JSONExtractString(labels, %s)", clickhousesql.StringLiteral(key.Name)), nil
	}
	return col.Name, nil
}

// Read composes the bare read of one key with its membership test. JSONHas
// tests a label inside the JSON. An absent label reads the empty string.
// That is the keyless contract here, so no query guards it. Every real
// column is always present.
func (m *storage) Read(ctx context.Context, q qbtypes.QueryInfo, key *telemetrytypes.TelemetryFieldKey) (qbtypes.Read, error) {
	col, err := m.getColumn(ctx, key)
	if err != nil {
		return qbtypes.Read{}, err
	}
	sql, err := m.read(ctx, q, key)
	if err != nil {
		return qbtypes.Read{}, err
	}
	if col.Name == "labels" && key.Name != "labels" {
		presence := fmt.Sprintf("JSONHas(labels, %s)", clickhousesql.StringLiteral(key.Name))
		return qbtypes.Read{
			SQL:        sql,
			Presence:   presence,
			Absence:    "not " + presence,
			WhenAbsent: qbtypes.AbsentIsValue,
		}, nil
	}
	return qbtypes.Read{SQL: sql, Presence: "true", Absence: "false", WhenAbsent: qbtypes.AlwaysPresent}, nil
}

// Fallback returns nil: rule-state history has no attribute-map fallback, so
// a key metadata does not hold stays unresolved and the caller errors.
func (m *storage) Fallback(context.Context, qbtypes.QueryInfo, *telemetrytypes.TelemetryFieldKey, qbtypes.FilterOperator, any) ([]*telemetrytypes.LogicalField, error) {
	return nil, nil
}

func (m *storage) Traits() qbtypes.Traits {
	return qbtypes.Traits{}
}

func (m *storage) Compile(ctx context.Context, q qbtypes.QueryInfo, logical *telemetrytypes.LogicalField, operator qbtypes.FilterOperator, value any, sb *sqlbuilder.SelectBuilder) (qbtypes.Compiled, error) {
	return querybuilder.SharedCondition(ctx, q, m, logical, operator, value, sb)
}
