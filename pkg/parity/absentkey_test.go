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

func TestAColumnWithoutAPlainValueKeepsTheCasesWithoutOne(t *testing.T) {
	got := cases(t, AbsentKeyColumn{Attribute: "rpc.method", Present: []string{`a\b`, "x[1]", "^y", "", "bad\x01"}})
	var ops []string
	for _, c := range got {
		ops = append(ops, c.Operator)
	}
	assert.Equal(t, []string{"NOT EXISTS", "NOT EXISTS", "EXISTS", ""}, ops, "a backslash, a bracket, a caret, an empty or a control character never reach a filter")
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
