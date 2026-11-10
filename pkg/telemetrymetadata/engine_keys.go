package telemetrymetadata

import (
	"context"
	"encoding/json"
	"maps"
	"reflect"
	"slices"
	"strings"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/telemetryschema/tracestelemetryschema"
	"github.com/fuseone-io/fusescope/pkg/telemetrystore"
	"github.com/fuseone-io/fusescope/pkg/types/telemetrytypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
)

var ErrCodeEngineKeys = errors.MustNewCode("telemetrymetadata_engine_keys")

// engineKeysLimit is the listing a selector without a limit asks for, as the ClickHouse keys
// lookup has it.
const engineKeysLimit = 1000

// EngineKeyStore resolves trace field keys from fusescope-engine's attribute_keys table through the
// metadata.keys action, for the builder of the engine dialect. It never reads ClickHouse: a failed,
// partial or malformed listing is an error. The intrinsic, calculated and search scope fields come
// from the static schema, as in the ClickHouse lookup.
type EngineKeyStore struct {
	store telemetrystore.TelemetryStore
}

func NewEngineKeyStore(store telemetrystore.TelemetryStore) *EngineKeyStore {
	return &EngineKeyStore{store: store}
}

type keysRequest struct {
	Signal string `json:"signal"`
	Prefix string `json:"prefix"`
	Limit  int    `json:"limit"`
}

// GetKeysMulti lists, for every selector, the engine keys it matches: an exact selector by its
// name, case-sensitive, a fuzzy one by a substring of any key, case-insensitive, both narrowed by
// an attribute, resource or scope context and by a data type when given. Selectors sharing a prefix
// share one listing; the answer is incomplete when a listing reached its limit.
func (s *EngineKeyStore) GetKeysMulti(ctx context.Context, orgID valuer.UUID, selectors []*telemetrytypes.FieldKeySelector) (map[string][]*telemetrytypes.TelemetryFieldKey, bool, error) {
	limits := map[string]int{}
	for _, selector := range selectors {
		if selector.Signal != telemetrytypes.SignalTraces && selector.Signal != telemetrytypes.SignalUnspecified {
			return nil, false, errors.Newf(errors.TypeUnsupported, ErrCodeEngineKeys, "the engine key store lists trace keys only, not %s", selector.Signal.StringValue())
		}
		prefix := ""
		if selector.SelectorMatchType == telemetrytypes.FieldSelectorMatchTypeExact {
			prefix = selector.Name
		}
		limit := selector.Limit
		if limit <= 0 {
			limit = engineKeysLimit
		}
		limits[prefix] = max(limits[prefix], limit)
	}

	out := map[string][]*telemetrytypes.TelemetryFieldKey{}
	seen := map[string]bool{}
	add := func(key *telemetrytypes.TelemetryFieldKey) {
		id := key.Name + ";" + key.FieldContext.StringValue() + ";" + key.FieldDataType.StringValue()
		if !seen[id] {
			seen[id] = true
			out[key.Name] = append(out[key.Name], key)
		}
	}
	complete := true
	for _, prefix := range slices.Sorted(maps.Keys(limits)) {
		keys, truncated, err := s.list(ctx, orgID, prefix, limits[prefix])
		if err != nil {
			return nil, false, err
		}
		complete = complete && !truncated
		for _, key := range keys {
			if slices.ContainsFunc(selectors, func(selector *telemetrytypes.FieldKeySelector) bool { return engineKeyMatches(key, selector) }) {
				add(key)
			}
		}
	}

	staticFields := slices.Collect(maps.Values(tracestelemetryschema.SpanSearchScopeFields))
	staticFields = append(staticFields, slices.Collect(maps.Values(tracestelemetryschema.IntrinsicFields))...)
	staticFields = append(staticFields, slices.Collect(maps.Values(tracestelemetryschema.CalculatedFields))...)
	for _, field := range staticFields {
		if staticFieldMatchesAny(field, selectors) {
			add(&field)
		}
	}
	applyBackwardCompatibleKeys(out)
	return out, complete, nil
}

// engineKeyMatches mirrors the ClickHouse keys-table conditions for one listed key.
func engineKeyMatches(key *telemetrytypes.TelemetryFieldKey, selector *telemetrytypes.FieldKeySelector) bool {
	if selector.SelectorMatchType == telemetrytypes.FieldSelectorMatchTypeExact {
		if key.Name != selector.Name {
			return false
		}
	} else if !strings.Contains(strings.ToLower(key.Name), strings.ToLower(selector.Name)) {
		return false
	}
	switch selector.FieldContext {
	case telemetrytypes.FieldContextAttribute, telemetrytypes.FieldContextResource, telemetrytypes.FieldContextScope:
		if key.FieldContext != selector.FieldContext {
			return false
		}
	}
	if selector.FieldDataType != telemetrytypes.FieldDataTypeUnspecified && selector.FieldDataType.TagDataType() != key.FieldDataType.TagDataType() {
		return false
	}
	return true
}

// list asks for one more key than limit, so a listing that reaches it is known to be truncated.
func (s *EngineKeyStore) list(ctx context.Context, orgID valuer.UUID, prefix string, limit int) ([]*telemetrytypes.TelemetryFieldKey, bool, error) {
	body, err := json.Marshal(keysRequest{Signal: "traces", Prefix: prefix, Limit: limit + 1})
	if err != nil {
		return nil, false, errors.WrapInternalf(err, ErrCodeEngineKeys, "error encoding the key listing")
	}
	rows, err := s.store.Do(telemetrystore.WithTenant(ctx, orgID), "metadata.keys", body)
	if err != nil {
		return nil, false, err
	}
	defer rows.Close()
	if warnings := rows.Warnings(); len(warnings) > 0 {
		return nil, false, errors.Newf(errors.TypeInternal, ErrCodeEngineKeys, "the key listing is partial: %s", strings.Join(warnings, ", "))
	}
	scan, err := keyScanner(rows)
	if err != nil {
		return nil, false, err
	}
	var keys []*telemetrytypes.TelemetryFieldKey
	for rows.Next() {
		if len(keys) == limit {
			return keys, true, nil
		}
		key, err := scan()
		if err != nil {
			return nil, false, err
		}
		keys = append(keys, key)
	}
	return keys, false, rows.Err()
}

var engineKeySources = map[string]telemetrytypes.FieldContext{
	"span":     telemetrytypes.FieldContextAttribute,
	"resource": telemetrytypes.FieldContextResource,
	"scope":    telemetrytypes.FieldContextScope,
}

var engineKeyTypes = map[string]telemetrytypes.FieldDataType{
	"string": telemetrytypes.FieldDataTypeString,
	"number": telemetrytypes.FieldDataTypeFloat64,
	"bool":   telemetrytypes.FieldDataTypeBool,
}

// keyScanner reads the key, source and type of the current row, whatever the other columns.
func keyScanner(rows telemetrystore.Rows) (func() (*telemetrytypes.TelemetryFieldKey, error), error) {
	types := rows.ColumnTypes()
	dest := make([]any, len(types))
	at := map[string]int{}
	for i, t := range types {
		dest[i] = reflect.New(t.ScanType()).Interface()
		at[t.Name()] = i
	}
	for _, name := range []string{"key", "source", "type"} {
		i, ok := at[name]
		if !ok || types[i].ScanType().Kind() != reflect.String {
			return nil, errors.Newf(errors.TypeInternal, ErrCodeEngineKeys, "the key listing has no text column %q", name)
		}
	}
	text := func(name string) string { return *(dest[at[name]].(*string)) }
	return func() (*telemetrytypes.TelemetryFieldKey, error) {
		if err := rows.Scan(dest...); err != nil {
			return nil, err
		}
		context, okSource := engineKeySources[text("source")]
		dataType, okType := engineKeyTypes[text("type")]
		if !okSource || !okType {
			return nil, errors.Newf(errors.TypeInternal, ErrCodeEngineKeys, "the engine lists a key of source %q and type %q", text("source"), text("type"))
		}
		return &telemetrytypes.TelemetryFieldKey{Name: text("key"), Signal: telemetrytypes.SignalTraces, FieldContext: context, FieldDataType: dataType}, nil
	}, nil
}
