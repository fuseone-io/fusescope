package datafusionsql

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestInterpolate(t *testing.T) {
	cases := []struct {
		name string
		sql  string
		args []any
		want string
	}{
		{
			name: "every placeholder outside quotes and comments",
			sql:  `SELECT ? FROM t WHERE a = '?' AND "?" = ? -- ?` + "\n" + `AND b /* ? */ = ?`,
			args: []any{"x", int64(-1), uint64(2)},
			want: `SELECT 'x' FROM t WHERE a = '?' AND "?" = (-1) -- ?` + "\n" + `AND b /* ? */ = 2`,
		},
		{
			name: "a doubled quote stays inside its string",
			sql:  `SELECT 'it''s ?', "a""?", ?`,
			args: []any{true},
			want: `SELECT 'it''s ?', "a""?", true`,
		},
		{
			name: "values of every kind",
			sql:  `?, ?, ?, ?, ?, ?, ?, ?, ?`,
			args: []any{"o'k", 7, int32(-3), uint32(4), 1.5, float32(-0.5), false, []string{"a", "b"}, []any{int64(1), "c"}},
			want: `'o''k', 7, (-3), 4, 1.5, (-0.5), false, ['a', 'b'], [1, 'c']`,
		},
		{
			name: "no placeholder",
			sql:  `SELECT 1`,
			want: `SELECT 1`,
		},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got, err := Interpolate(c.sql, c.args)
			require.NoError(t, err)
			assert.Equal(t, c.want, got)
		})
	}
}

func TestInterpolateRefuses(t *testing.T) {
	cases := []struct {
		name string
		sql  string
		args []any
	}{
		{name: "more placeholders than args", sql: `? = ?`, args: []any{1}},
		{name: "more args than placeholders", sql: `? = 1`, args: []any{1, 2}},
		{name: "a type without a literal", sql: `?`, args: []any{struct{}{}}},
		{name: "a nil value", sql: `?`, args: []any{nil}},
		{name: "a value that cannot be rendered", sql: `?`, args: []any{"a\x00b"}},
		{name: "an infinite float", sql: `?`, args: []any{[]any{1.0 / zero()}}},
		{name: "an unterminated string", sql: `'? = ?`, args: []any{1}},
		{name: "an unterminated comment", sql: `/* ? = ?`, args: []any{1}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			_, err := Interpolate(c.sql, c.args)
			require.Error(t, err)
		})
	}
}

func zero() float64 { return 0 }

func TestBacktickIdentifiers(t *testing.T) {
	cases := []struct {
		name string
		sql  string
		want string
	}{
		{name: "a ClickHouse identifier becomes a quoted one", sql: "SELECT x AS `__GROUP_BY_KEY_0_service.name` FROM t", want: `SELECT x AS "__GROUP_BY_KEY_0_service.name" FROM t`},
		{name: "its escapes are undone", sql: "SELECT `a\\`b\\\\c\\x24{d}\"e`", want: `SELECT "a` + "`" + `b\c${d}""e"`},
		{name: "a backtick inside a string stays", sql: "SELECT '`?`', \"`\"", want: "SELECT '`?`', \"`\""},
		{name: "a ? inside an identifier is text", sql: "SELECT `a?` = ?", want: `SELECT "a?" = ?`},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got, err := BacktickIdentifiers(c.sql)
			require.NoError(t, err)
			assert.Equal(t, c.want, got)
		})
	}
	for _, sql := range []string{"SELECT `a", "SELECT ``", "SELECT `a\x00`"} {
		_, err := BacktickIdentifiers(sql)
		require.Error(t, err, sql)
	}
}
