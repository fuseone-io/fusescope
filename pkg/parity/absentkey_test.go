package parity

import (
	"testing"

	"github.com/fuseone-io/fusescope/pkg/parser/filterquery"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func cases(t *testing.T, columns ...AbsentKeyColumn) []AbsentKeyCase {
	t.Helper()
	got := sampler(t, 7).AbsentKeyCases("t1", columns)
	for _, c := range got {
		if c.Filter == "" {
			continue
		}
		_, _, errs := filterquery.Parse(c.Filter)
		require.Empty(t, errs.Errors, c.Filter)
	}
	return got
}

func TestEveryNegativeOperatorIsAskedOfAnAbsentKey(t *testing.T) {
	got := cases(t, AbsentKeyColumn{Attribute: "http.route", Present: []string{"/a/{id}"}})
	list, count := func(op, filter string) AbsentKeyCase {
		return AbsentKeyCase{Attribute: "http.route", Operator: op, Shape: ShapeList, Filter: filter}
	}, func(op, filter string) AbsentKeyCase {
		return AbsentKeyCase{Attribute: "http.route", Operator: op, Shape: ShapeCount, Filter: filter}
	}
	assert.Equal(t, []AbsentKeyCase{
		list("!=", `http.route != '/a/{id}'`), count("!=", `http.route != '/a/{id}'`),
		list("NOT IN", `http.route NOT IN ('/a/{id}')`), count("NOT IN", `http.route NOT IN ('/a/{id}')`),
		list("NOT LIKE", `http.route NOT LIKE '/a/{id}%'`), count("NOT LIKE", `http.route NOT LIKE '/a/{id}%'`),
		list("NOT REGEXP", `http.route NOT REGEXP '^/a/[{]id[}]'`), count("NOT REGEXP", `http.route NOT REGEXP '^/a/[{]id[}]'`),
		list("NOT EXISTS", `http.route NOT EXISTS`), count("NOT EXISTS", `http.route NOT EXISTS`),
		list("EXISTS", `http.route EXISTS`),
		{Attribute: "http.route", Shape: ShapeSelect},
	}, got)
}

func TestNotInTakesTwoPresentValuesWhenThereAreTwo(t *testing.T) {
	got := cases(t, AbsentKeyColumn{Attribute: "db.name", Present: []string{"orders", "users", "carts"}})
	var notIn []string
	for _, c := range got {
		if c.Operator == "NOT IN" {
			notIn = append(notIn, c.Filter)
		}
	}
	require.Len(t, notIn, 2)
	assert.Regexp(t, `^db\.name NOT IN \('[a-z]+', '[a-z]+'\)$`, notIn[0])
}

func TestAQuoteInAValueIsEscaped(t *testing.T) {
	got := cases(t, AbsentKeyColumn{Attribute: "peer.service", Present: []string{"o'brien"}})
	require.NotEmpty(t, got)
	assert.Equal(t, `peer.service != 'o\'brien'`, got[0].Filter)
}

func operators(got []AbsentKeyCase) []string {
	var ops []string
	for _, c := range got {
		ops = append(ops, c.Operator)
	}
	return ops
}

var everyOperator = []string{"!=", "!=", "NOT IN", "NOT IN", "NOT LIKE", "NOT LIKE", "NOT REGEXP", "NOT REGEXP", "NOT EXISTS", "NOT EXISTS", "EXISTS", ""}

func TestAKeyWithoutASafeValueStillHasEveryOperator(t *testing.T) {
	for name, present := range map[string][]string{
		"absent from every span": nil,
		"only unsafe values":     {`a\b`, "x[1]", "^y", "", "bad\x01"},
	} {
		got := cases(t, AbsentKeyColumn{Attribute: "rpc.method", Present: present})
		assert.Equal(t, everyOperator, operators(got), name)
		require.NotEmpty(t, got, name)
		assert.Equal(t, `rpc.method != '`+AbsentKeySentinel+`'`, got[0].Filter, "the sentinel, which no span is expected to hold")
		for _, c := range got {
			for _, unsafe := range []string{`\`, "[1]", "^y", "\x01"} {
				if c.Operator != "NOT REGEXP" || unsafe != "^y" {
					assert.NotContains(t, c.Filter, unsafe, name)
				}
			}
		}
	}
}

func TestNotLikeNeverTakesAWildcardFromAValue(t *testing.T) {
	notLike := func(got []AbsentKeyCase) string {
		for _, c := range got {
			if c.Operator == "NOT LIKE" {
				return c.Filter
			}
		}
		return ""
	}
	assert.Equal(t, `db.name NOT LIKE 'orders%'`, notLike(cases(t, AbsentKeyColumn{Attribute: "db.name", Present: []string{"find_one", "orders", "100%"}})))
	got := cases(t, AbsentKeyColumn{Attribute: "db.name", Present: []string{"%", "_"}})
	assert.Equal(t, `db.name NOT LIKE '`+AbsentKeySentinel+`%'`, notLike(got), "a value of only wildcards would match the empty string too")
	assert.Equal(t, everyOperator, operators(got))
}

func TestOnlyPromotedTextKeysHaveAbsentKeyCases(t *testing.T) {
	assert.Empty(t, cases(t, AbsentKeyColumn{Attribute: "user.id", Present: []string{"u"}}))
	assert.Empty(t, cases(t, AbsentKeyColumn{Attribute: "http.response.status_code", Present: []string{"200"}}), "a number, not text")
	for _, attr := range []string{"http.route", "db.name", "db.operation", "rpc.system", "rpc.service", "rpc.method", "messaging.system", "messaging.operation", "peer.service", "deployment.environment"} {
		assert.NotEmpty(t, cases(t, AbsentKeyColumn{Attribute: attr}), attr)
	}
}

func TestAbsentKeyCasesDoNotDependOnTheInputOrder(t *testing.T) {
	columns := []AbsentKeyColumn{
		{Attribute: "http.route", Present: names("/r", 20)},
		{Attribute: "db.name", Present: names("db", 20)},
	}
	reordered := []AbsentKeyColumn{
		{Attribute: "db.name", Present: shuffled(names("db", 20))},
		{Attribute: "http.route", Present: shuffled(names("/r", 20))},
	}
	got := cases(t, columns...)
	require.NotEmpty(t, got)
	assert.Equal(t, got, cases(t, reordered...))
	assert.Equal(t, "db.name", got[0].Attribute, "columns in name order")
}
