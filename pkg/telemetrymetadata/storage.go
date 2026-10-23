package telemetrymetadata

import (
	"context"
	"fmt"

	"github.com/fuseone-io/fusescope/pkg/clickhousesql"
	"github.com/fuseone-io/fusescope/pkg/telemetryschema/chschema"

	qbtypes "github.com/fuseone-io/fusescope/pkg/types/querybuildertypes/querybuildertypesv5"
	"github.com/fuseone-io/fusescope/pkg/types/telemetrytypes"
)

var (
	attributeMetadataColumns = map[string]*chschema.Column{
		"resource_attributes": {Name: "resource_attributes", Type: chschema.MapColumnType{
			KeyType:   chschema.LowCardinalityColumnType{ElementType: chschema.ColumnTypeString},
			ValueType: chschema.ColumnTypeString,
		}},
		"attributes": {Name: "attributes", Type: chschema.MapColumnType{
			KeyType:   chschema.LowCardinalityColumnType{ElementType: chschema.ColumnTypeString},
			ValueType: chschema.ColumnTypeString,
		}},
	}
)

type storage struct{}

var _ qbtypes.Storage = (*storage)(nil)

func NewStorage() qbtypes.Storage {
	return &storage{}
}

func (m *storage) getColumn(_ context.Context, _, _ uint64, key *telemetrytypes.TelemetryFieldKey) ([]*chschema.Column, error) {
	switch key.FieldContext {
	case telemetrytypes.FieldContextResource:
		return []*chschema.Column{attributeMetadataColumns["resource_attributes"]}, nil
	case telemetrytypes.FieldContextAttribute:
		return []*chschema.Column{attributeMetadataColumns["attributes"]}, nil
	}
	return nil, qbtypes.ErrColumnNotFound
}

func (m *storage) read(ctx context.Context, q qbtypes.QueryInfo, key *telemetrytypes.TelemetryFieldKey) (string, error) {
	columns, err := m.getColumn(ctx, q.StartNs, q.EndNs, key)
	if err != nil {
		return "", err
	}

	switch columns[0].Type {
	case chschema.MapColumnType{
		KeyType:   chschema.LowCardinalityColumnType{ElementType: chschema.ColumnTypeString},
		ValueType: chschema.ColumnTypeString,
	}:
		return fmt.Sprintf("%s[%s]", columns[0].Name, clickhousesql.StringLiteral(key.Name)), nil
	}
	return columns[0].Name, nil
}

// Read composes the bare read of one key with its map membership test.
func (m *storage) Read(ctx context.Context, q qbtypes.QueryInfo, key *telemetrytypes.TelemetryFieldKey) (qbtypes.Read, error) {
	columns, err := m.getColumn(ctx, q.StartNs, q.EndNs, key)
	if err != nil {
		return qbtypes.Read{}, err
	}
	sql, err := m.read(ctx, q, key)
	if err != nil {
		return qbtypes.Read{}, err
	}
	presence := fmt.Sprintf("mapContains(%s, %s)", columns[0].Name, clickhousesql.StringLiteral(key.Name))
	return qbtypes.Read{
		SQL:        sql,
		Presence:   presence,
		Absence:    "NOT " + presence,
		WhenAbsent: qbtypes.AbsentIsSentinel,
	}, nil
}

// Fallback returns nil: the metadata tables have no attribute synthesis, so
// a key metadata does not hold yields no condition.
func (m *storage) Fallback(context.Context, qbtypes.QueryInfo, *telemetrytypes.TelemetryFieldKey, qbtypes.FilterOperator, any) ([]*telemetrytypes.LogicalField, error) {
	return nil, nil
}

func (m *storage) Traits() qbtypes.Traits {
	return qbtypes.Traits{UnknownKey: qbtypes.IgnoreUnknownKey}
}
