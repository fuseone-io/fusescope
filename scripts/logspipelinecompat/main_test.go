package main

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const (
	expr   = "github.com/expr-lang/expr"
	stanza = "github.com/open-telemetry/opentelemetry-collector-contrib/pkg/stanza"
	pdata  = "go.opentelemetry.io/collector/pdata"
)

func TestCompare(t *testing.T) {
	required := map[string]string{expr: "v1.17.8", stanza: "v0.164.1", pdata: "v1.70.0"}
	same := map[string]module{expr: {Version: "v1.17.8"}, stanza: {Version: "v0.164.1"}, pdata: {Version: "v1.70.0"}}
	forked := map[string]module{expr: {Version: "v1.17.8", Replace: &module{Path: "github.com/SigNoz/expr", Version: "v1.17.7-beta"}}, stanza: {Version: "v0.164.1"}, pdata: {Version: "v1.70.0"}}
	bumped := map[string]module{expr: {Version: "v1.17.8"}, stanza: {Version: "v0.165.0"}, pdata: {Version: "v1.70.0"}}
	forkApproved := []string{expr + " v1.17.8 => github.com/SigNoz/expr v1.17.7-beta"}

	tests := []struct {
		name     string
		selected map[string]module
		approved []string
		problems []string
	}{
		{"the library's versions", same, nil, nil},
		{"a replace that is approved", forked, forkApproved, nil},
		{"a replace that is not approved", forked, nil, []string{"drift not approved: " + expr + " v1.17.8 => github.com/SigNoz/expr v1.17.7-beta"}},
		{"a bump that is not approved", bumped, nil, []string{"drift not approved: " + stanza + " v0.164.1 => v0.165.0"}},
		{"an approval no drift matches", same, forkApproved, []string{"approval matches no drift, remove it: " + expr + " v1.17.8 => github.com/SigNoz/expr v1.17.7-beta"}},
		{"a module the build does not select", map[string]module{expr: {Version: "v1.17.8"}, pdata: {Version: "v1.70.0"}}, nil, []string{"not selected by this build: " + stanza}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.problems, compare([]string{expr, stanza, pdata}, required, tt.selected, tt.approved))
		})
	}
}

// A module the library does not require is not compared.
func TestCompareSkipsModulesTheLibraryDoesNotRequire(t *testing.T) {
	assert.Empty(t, compare([]string{expr}, map[string]string{}, map[string]module{expr: {Version: "v1.17.9"}}, nil))
}

func TestParseApproved(t *testing.T) {
	approved, err := parseApproved(strings.NewReader(`
# comment
github.com/expr-lang/expr v1.17.8 => github.com/SigNoz/expr v1.17.7-beta   # the query builder's fork
`))
	require.NoError(t, err)
	assert.Equal(t, []string{"github.com/expr-lang/expr v1.17.8 => github.com/SigNoz/expr v1.17.7-beta"}, approved)

	_, err = parseApproved(strings.NewReader("github.com/expr-lang/expr v1.17.8\n"))
	assert.Error(t, err, "a line without => is refused")
}

func TestRequires(t *testing.T) {
	got, err := requires([]byte(`module m

go 1.26.0

require (
	github.com/expr-lang/expr v1.17.8
	go.opentelemetry.io/collector/pdata v1.70.0 // indirect
)
`))
	require.NoError(t, err)
	assert.Equal(t, map[string]string{expr: "v1.17.8", pdata: "v1.70.0"}, got)
}
