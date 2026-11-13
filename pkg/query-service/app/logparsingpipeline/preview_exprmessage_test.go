package logparsingpipeline

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.opentelemetry.io/collector/pdata/plog"
)

// The collector's text of a failed `matches` on a non-string value, which the
// backend's expr flavour words "not string" (collector ADR 0012, decision 4).
func TestNormalizeExprMessage(t *testing.T) {
	const intIf = "running if expr: interface conversion: interface {} is int64, not string (1:48)\n" +
		" | attributes?.status != nil && attributes.status matches \"^(?P<first>\\\\d)(?P<rest>\\\\d+)$\"\n" +
		" | ...............................................^"
	tests := []struct {
		name, in, want string
	}{
		{
			name: "int on matches",
			in:   intIf,
			want: "running if expr: interface conversion: interface {} is int64, not []uint8 (1:48)\n" +
				" | attributes?.status != nil && attributes.status matches \"^(?P<first>\\\\d)(?P<rest>\\\\d+)$\"\n" +
				" | ...............................................^",
		},
		{
			name: "map on matches",
			in: "running if expr: interface conversion: interface {} is map[string]interface {}, not string (1:21)\n" +
				" | body != nil && body matches \"^(?P<verb>[A-Z]+)\"\n" +
				" | ....................^",
			want: "running if expr: interface conversion: interface {} is map[string]interface {}, not []uint8 (1:21)\n" +
				" | body != nil && body matches \"^(?P<verb>[A-Z]+)\"\n" +
				" | ....................^",
		},
		{
			name: "non-ASCII before matches: the column counts runes",
			in: "running if expr: interface conversion: interface {} is int64, not string (1:44)\n" +
				" | attributes?.ação != nil && attributes.ação matches \"^a\"\n" +
				" | ...........................................^",
			want: "running if expr: interface conversion: interface {} is int64, not []uint8 (1:44)\n" +
				" | attributes?.ação != nil && attributes.ação matches \"^a\"\n" +
				" | ...........................................^",
		},
	}
	unchanged := []struct{ name, in string }{
		{"bytes on matches: no canonical text, kept as the backend says it", "running if expr: interface conversion: interface {} is []uint8, not string (1:21)\n" +
			" | body != nil && body matches \"^(?P<verb>[A-Z]+)\"\n" +
			" | ....................^"},
		{"the cursor on contains", "running if expr: interface conversion: interface {} is int64, not string (1:22)\n" +
			" | body != nil && body contains \"x\"\n" +
			" | .....................^"},
		{"the cursor on +", "running if expr: interface conversion: interface {} is int64, not string (1:3)\n" +
			" | a + \"x\"\n" +
			" | ..^"},
		{"the cursor on an identifier that starts with matches", "running if expr: interface conversion: interface {} is int64, not string (1:12)\n" +
			" | attributes.matches_count matches \"^1\"\n" +
			" | ...........^"},
		{"a route expression", "running route expr: interface conversion: interface {} is int64, not string (1:21)\n" +
			" | body != nil && body matches \"^a\"\n" +
			" | ....................^"},
		{"another target type", "running if expr: interface conversion: interface {} is int64, not int (1:21)\n" +
			" | body != nil && body matches \"^a\"\n" +
			" | ....................^"},
		{"a cursor that disagrees with the column", "running if expr: interface conversion: interface {} is int64, not string (1:21)\n" +
			" | body != nil && body matches \"^a\"\n" +
			" | .........^"},
		{"no snippet", "running if expr: interface conversion: interface {} is int64, not string (1:21)"},
		{"an extra line after the cursor", "running if expr: interface conversion: interface {} is int64, not string (1:21)\n" +
			" | body != nil && body matches \"^a\"\n" +
			" | ....................^\nmore"},
		{"another error", "move: field does not exist: body.msg"},
		{"not string elsewhere in the text", "value cannot be parsed: interface {} is int64, not string"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, normalizeExprMessage(tt.in))
		})
	}
	for _, tt := range unchanged {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.in, normalizeExprMessage(tt.in))
		})
	}
}

// The preview shows the normalised text: the normalisation runs where the
// messages are built, not only in a test comparator.
func TestPreviewShowsTheCollectorsExprText(t *testing.T) {
	processors := []previewProcessor{{Name: "p", Operators: []map[string]any{
		{"type": "regex_parser", "id": "re", "regex": "^(?P<a>a)", "parse_from": "attributes[\"ação\"]",
			"if": "attributes?.ação != nil && attributes.ação matches \"^a\"", "on_error": "send"},
	}}}
	ld := plog.NewLogs()
	ld.ResourceLogs().AppendEmpty().ScopeLogs().AppendEmpty().LogRecords().AppendEmpty().Attributes().PutInt("ação", 7)
	_, messages, err := simulateWithLogspipeline(context.Background(), processors, []plog.Logs{ld})
	require.NoError(t, err)
	require.Len(t, messages, 1)
	assert.Equal(t, "operator re: running if expr: interface conversion: interface {} is int64, not []uint8 (1:44)\n"+
		" | attributes?.ação != nil && attributes.ação matches \"^a\"\n"+
		" | ...........................................^", messages[0])
}
