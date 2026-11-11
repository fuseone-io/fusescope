package parity

import (
	"maps"
	"slices"
	"strings"
	"unicode"
	"unicode/utf8"
)

// absentKeyAttributes are the promoted text keys a span may lack, which the engine reads as NULL and
// ClickHouse as an empty string (D8).
var absentKeyAttributes = map[string]bool{
	"http.route": true, "db.name": true, "db.operation": true,
	"rpc.system": true, "rpc.service": true, "rpc.method": true,
	"messaging.system": true, "messaging.operation": true,
	"peer.service": true, "deployment.environment": true,
}

// AbsentKeySentinel stands for a present value when a key has no safe one: no span is expected to
// hold it, so every negative operator keeps every row and still tells NULL from the empty string.
const AbsentKeySentinel = "fusescope-parity-absent"

// maxCaseValueBytes caps a present value written into a filter.
const maxCaseValueBytes = 128

// Shape is what an absent-key case asks for.
type Shape string

const (
	ShapeList  Shape = "list"
	ShapeCount Shape = "count"
	// ShapeSelect is a list that selects the key, without a filter.
	ShapeSelect Shape = "select"
)

// AbsentKeyColumn is a promoted key some spans of the window lack, with values other spans have.
type AbsentKeyColumn struct {
	Attribute string
	Present   []string
}

// AbsentKeyCase is one pair that tests an absent key: a filter in the query builder's language,
// empty for ShapeSelect.
type AbsentKeyCase struct {
	Attribute string
	Operator  string
	Shape     Shape
	Filter    string
}

// AbsentKeyCases is, for every promoted text key in columns, lists and counts under each negative
// operator, a list under EXISTS and a list selecting the key. The operators that need a value take
// one or two present values by rank, NOT LIKE the first without a LIKE wildcard, and
// AbsentKeySentinel when there is none.
func (s Sampler) AbsentKeyCases(tenant string, columns []AbsentKeyColumn) []AbsentKeyCase {
	present := map[string][]string{}
	for _, c := range columns {
		if absentKeyAttributes[c.Attribute] {
			present[c.Attribute] = append(present[c.Attribute], c.Present...)
		}
	}
	attributes := make([]string, 0, len(present))
	for attribute := range present {
		attributes = append(attributes, attribute)
	}
	slices.Sort(attributes)

	var out []AbsentKeyCase
	for _, attribute := range attributes {
		values := s.ranked("absent_value", tenant, attribute, slices.DeleteFunc(present[attribute], func(v string) bool { return !plain(v) }))
		add := func(op, filter string, shapes ...Shape) {
			for _, shape := range shapes {
				out = append(out, AbsentKeyCase{Attribute: attribute, Operator: op, Shape: shape, Filter: filter})
			}
		}
		v := AbsentKeySentinel
		if len(values) > 0 {
			v = values[0]
		}
		in := []string{quote(v)}
		if len(values) > 1 {
			in = append(in, quote(values[1]))
		}
		like := AbsentKeySentinel
		if i := slices.IndexFunc(values, func(v string) bool { return !strings.ContainsAny(v, "%_") }); i >= 0 {
			like = values[i]
		}
		add("!=", attribute+" != "+quote(v), ShapeList, ShapeCount)
		add("NOT IN", attribute+" NOT IN ("+strings.Join(in, ", ")+")", ShapeList, ShapeCount)
		add("NOT LIKE", attribute+" NOT LIKE "+quote(like+"%"), ShapeList, ShapeCount)
		add("NOT REGEXP", attribute+" NOT REGEXP "+quote("^"+literalPattern(v)), ShapeList, ShapeCount)
		add("NOT EXISTS", attribute+" NOT EXISTS", ShapeList, ShapeCount)
		add("EXISTS", attribute+" EXISTS", ShapeList)
		out = append(out, AbsentKeyCase{Attribute: attribute, Shape: ShapeSelect})
	}
	return out
}

// plain tells whether v can be written into a filter and read back the same by both stores: no
// backslash, whose escaping the filter language and the stores read differently, and no bracket or
// caret, which literalPattern cannot neutralise.
func plain(v string) bool {
	if v == "" || len(v) > maxCaseValueBytes || !utf8.ValidString(v) {
		return false
	}
	return !strings.ContainsFunc(v, func(r rune) bool {
		return unicode.IsControl(r) || strings.ContainsRune(`\[]^`, r)
	})
}

func quote(v string) string { return "'" + strings.ReplaceAll(v, "'", `\'`) + "'" }

// literalPattern matches v literally in a regular expression without a backslash: each
// metacharacter becomes a one-character class.
func literalPattern(v string) string {
	var b strings.Builder
	for _, r := range v {
		if strings.ContainsRune(`.+*?()|{}$`, r) {
			b.WriteByte('[')
			b.WriteRune(r)
			b.WriteByte(']')
			continue
		}
		b.WriteRune(r)
	}
	return b.String()
}

// AbsentKeyAttributes are the promoted text keys whose absence the round tests, in name order.
func AbsentKeyAttributes() []string {
	return slices.Sorted(maps.Keys(absentKeyAttributes))
}
