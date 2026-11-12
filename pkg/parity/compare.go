package parity

import (
	"encoding/json"
	"fmt"
	"maps"
	"reflect"
	"slices"
	"strings"
)

// Kind is the shape of a difference between two answers.
type Kind string

const (
	// KindField is a value that differs, including a null against an empty string.
	KindField Kind = "field"
	// KindRows is a key or an item on one side only, or lists of different lengths.
	KindRows Kind = "rows"
	// KindOrder is the same items in a different order where the order is the contract.
	KindOrder Kind = "order"
	// KindQuantile is a number on a quantile path, left for JudgeQuantile.
	KindQuantile Kind = "quantile"
)

// Path addresses a value in an answer: a string is a field of the contract, a Dynamic segment
// names tenant data, an int is a list position.
type Path []any

// Keyed is a collection without a contractual order, keyed by values that name tenant data: a
// view's normalization turns such a list into it.
type Keyed map[string]any

// Rule is what a view leaves to the comparison: the paths that hold quantiles and the paths
// outside the contract.
type Rule struct {
	Quantile func(Path) bool
	Excluded func(Path) bool
	// Reconcile, when set, adjusts both normalized answers in place before they are compared, for
	// what only the pair can tell, such as a row a limit cut from one side.
	Reconcile func(engine, clickhouse any)
}

// Difference is one place two answers differ, with both values. The values stay in memory: a
// report writes them through a Fingerprinter.
type Difference struct {
	Path       Path
	Kind       Kind
	Engine     any
	ClickHouse any
}

// Compare walks the engine's and ClickHouse's answers of one view, already normalized by the view,
// and returns where they differ. Every list left is ordered by contract.
func Compare(engine, clickhouse any, rule Rule) []Difference {
	if rule.Reconcile != nil {
		rule.Reconcile(engine, clickhouse)
	}
	var diffs []Difference
	compare(Path{}, engine, clickhouse, rule, &diffs)
	return diffs
}

func compare(path Path, engine, clickhouse any, rule Rule, diffs *[]Difference) {
	if rule.Excluded != nil && len(path) > 0 && rule.Excluded(path) {
		return
	}
	switch e := engine.(type) {
	case map[string]any:
		if c, ok := clickhouse.(map[string]any); ok {
			compareMaps(path, e, c, func(k string) any { return k }, rule, diffs)
			return
		}
	case Keyed:
		if c, ok := clickhouse.(Keyed); ok {
			compareMaps(path, e, c, func(k string) any { return Dynamic(k) }, rule, diffs)
			return
		}
	case []any:
		if c, ok := clickhouse.([]any); ok {
			compareLists(path, e, c, rule, diffs)
			return
		}
	}
	if equalValues(engine, clickhouse) {
		return
	}
	kind := KindField
	if isNumber(engine) && isNumber(clickhouse) && rule.Quantile != nil && rule.Quantile(path) {
		kind = KindQuantile
	}
	*diffs = append(*diffs, Difference{Path: path, Kind: kind, Engine: engine, ClickHouse: clickhouse})
}

func compareMaps[M ~map[string]any](path Path, engine, clickhouse M, segment func(string) any, rule Rule, diffs *[]Difference) {
	keys := slices.Sorted(maps.Keys(engine))
	for key := range clickhouse {
		if _, ok := engine[key]; !ok {
			keys = append(keys, key)
		}
	}
	slices.Sort(keys)
	for _, key := range keys {
		at := append(slices.Clone(path), segment(key))
		e, inEngine := engine[key]
		c, inClickHouse := clickhouse[key]
		if !inEngine || !inClickHouse {
			if rule.Excluded == nil || !rule.Excluded(at) {
				*diffs = append(*diffs, Difference{Path: at, Kind: KindRows, Engine: e, ClickHouse: c})
			}
			continue
		}
		compare(at, e, c, rule, diffs)
	}
}

func compareLists(path Path, engine, clickhouse []any, rule Rule, diffs *[]Difference) {
	if len(engine) != len(clickhouse) {
		*diffs = append(*diffs, Difference{Path: path, Kind: KindRows, Engine: engine, ClickHouse: clickhouse})
		return
	}
	var inner []Difference
	for i := range engine {
		compare(append(slices.Clone(path), i), engine[i], clickhouse[i], rule, &inner)
	}
	if len(inner) == 0 {
		return
	}
	if sameItems(engine, clickhouse) {
		*diffs = append(*diffs, Difference{Path: path, Kind: KindOrder, Engine: engine, ClickHouse: clickhouse})
		return
	}
	*diffs = append(*diffs, inner...)
}

// sameItems tells whether two lists hold the same items as multisets.
func sameItems(a, b []any) bool {
	count := map[string]int{}
	for _, item := range a {
		count[canonical(item)]++
	}
	for _, item := range b {
		key := canonical(item)
		if count[key] == 0 {
			return false
		}
		count[key]--
	}
	return true
}

func canonical(v any) string {
	encoded, err := json.Marshal(v)
	if err != nil {
		return fmt.Sprintf("%#v", v)
	}
	return string(encoded)
}

func equalValues(a, b any) bool {
	if isNumber(a) && isNumber(b) {
		return numberString(a) == numberString(b)
	}
	return reflect.DeepEqual(a, b)
}

func isNumber(v any) bool {
	switch v.(type) {
	case int, int8, int16, int32, int64, uint, uint8, uint16, uint32, uint64, float32, float64:
		return true
	}
	return false
}

// numberString writes a number by value, so int64(5), uint64(5) and 5.0 compare equal and a large
// integer keeps every digit.
func numberString(v any) string {
	switch x := v.(type) {
	case float32:
		return fmt.Sprint(float64(x))
	case float64:
		if x == float64(int64(x)) {
			return fmt.Sprint(int64(x))
		}
		return fmt.Sprint(x)
	}
	return fmt.Sprint(v)
}

// String writes the path for memory and tests; a report writes it through Fingerprinter.Path.
func (p Path) String() string {
	var b strings.Builder
	for _, segment := range p {
		switch s := segment.(type) {
		case int:
			fmt.Fprintf(&b, "[%d]", s)
		case Dynamic:
			fmt.Fprintf(&b, "[%s]", string(s))
		default:
			if b.Len() > 0 {
				b.WriteByte('.')
			}
			fmt.Fprint(&b, s)
		}
	}
	return b.String()
}

// Last is the path's last fixed segment, the field a value is, or "".
func (p Path) Last() string {
	for i := len(p) - 1; i >= 0; i-- {
		if s, ok := p[i].(string); ok {
			return s
		}
	}
	return ""
}
