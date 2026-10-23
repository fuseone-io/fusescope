package resourcefilter

import (
	"context"
	"fmt"

	"github.com/fuseone-io/fusescope/pkg/clickhousesql"
	"github.com/fuseone-io/fusescope/pkg/telemetryschema/chschema"
	qbtypes "github.com/fuseone-io/fusescope/pkg/types/querybuildertypes/querybuildertypesv5"
	"github.com/fuseone-io/fusescope/pkg/types/telemetrytypes"
)

var (
	resourceColumns = map[string]*chschema.Column{
		"labels":                  {Name: "labels", Type: chschema.ColumnTypeString},
		"fingerprint":             {Name: "fingerprint", Type: chschema.ColumnTypeString},
		"seen_at_ts_bucket_start": {Name: "seen_at_ts_bucket_start", Type: chschema.ColumnTypeInt64},
	}
)

type storage struct{}

var _ qbtypes.Storage = (*storage)(nil)

func newStorage() *storage {
	return &storage{}
}

func (m *storage) getColumn(
	_ context.Context,
	_, _ uint64,
	key *telemetrytypes.TelemetryFieldKey,
) ([]*chschema.Column, error) {
	if key.FieldContext == telemetrytypes.FieldContextResource {
		return []*chschema.Column{resourceColumns["labels"]}, nil
	}
	if col, ok := resourceColumns[key.Name]; ok {
		return []*chschema.Column{col}, nil
	}
	return nil, qbtypes.ErrColumnNotFound
}

func (m *storage) read(ctx context.Context, q qbtypes.QueryInfo, key *telemetrytypes.TelemetryFieldKey) (string, error) {
	columns, err := m.getColumn(ctx, q.StartNs, q.EndNs, key)
	if err != nil {
		return "", err
	}
	if key.FieldContext == telemetrytypes.FieldContextResource {
		return fmt.Sprintf("simpleJSONExtractString(%s, %s)", columns[0].Name, clickhousesql.StringLiteral(key.Name)), nil
	}
	return columns[0].Name, nil
}

// Read composes the bare read of one key with its membership test. Only a
// resource key has a presence test in the labels JSON. Every other key is
// a real column and always present.
func (m *storage) Read(ctx context.Context, q qbtypes.QueryInfo, key *telemetrytypes.TelemetryFieldKey) (qbtypes.Read, error) {
	columns, err := m.getColumn(ctx, q.StartNs, q.EndNs, key)
	if err != nil {
		return qbtypes.Read{}, err
	}
	sql, err := m.read(ctx, q, key)
	if err != nil {
		return qbtypes.Read{}, err
	}
	if key.FieldContext != telemetrytypes.FieldContextResource {
		return qbtypes.Read{SQL: sql, Presence: "true", Absence: "false", WhenAbsent: qbtypes.AlwaysPresent}, nil
	}
	presence := fmt.Sprintf("simpleJSONHas(%s, %s)", columns[0].Name, clickhousesql.StringLiteral(key.Name))
	return qbtypes.Read{
		SQL:        sql,
		Presence:   presence,
		Absence:    "NOT " + presence,
		WhenAbsent: qbtypes.AbsentIsSentinel,
	}, nil
}

// Fallback returns nil: the fingerprint table holds only what the metadata
// reports, and a term it cannot serve is the main query's to evaluate.
func (m *storage) Fallback(context.Context, qbtypes.QueryInfo, *telemetrytypes.TelemetryFieldKey, qbtypes.FilterOperator, any) ([]*telemetrytypes.LogicalField, error) {
	return nil, nil
}

func (m *storage) Traits() qbtypes.Traits {
	return qbtypes.Traits{Split: qbtypes.FingerprintOfSplit, UnknownKey: qbtypes.IgnoreUnknownKey}
}
