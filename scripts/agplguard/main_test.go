package main

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestCompare(t *testing.T) {
	testCases := []struct {
		name       string
		deps       []string
		allowed    []string
		unexpected []string
		stale      []string
	}{
		{
			name:    "MatchingSets_Pass",
			deps:    []string{"github.com/fuseone-io/fusescope-otel-collector/constants", "github.com/other/module"},
			allowed: []string{"github.com/fuseone-io/fusescope-otel-collector/constants"},
		},
		{
			name:       "NewCollectorImport_Unexpected",
			deps:       []string{"github.com/fuseone-io/fusescope-otel-collector/utils", "github.com/fuseone-io/fusescope-otel-collector/pkg/keycheck"},
			allowed:    []string{"github.com/fuseone-io/fusescope-otel-collector/utils"},
			unexpected: []string{"github.com/fuseone-io/fusescope-otel-collector/pkg/keycheck"},
		},
		{
			name:    "DroppedImport_Stale",
			deps:    []string{"github.com/fuseone-io/fusescope-otel-collector/utils"},
			allowed: []string{"github.com/fuseone-io/fusescope-otel-collector/utils", "github.com/fuseone-io/fusescope-otel-collector/constants"},
			stale:   []string{"github.com/fuseone-io/fusescope-otel-collector/constants"},
		},
		{
			name: "NonCollectorDeps_Ignored",
			deps: []string{"github.com/fuseone-io/fusescope/pkg/errors", "github.com/fuseone-io/fusescope-otel-collectorx/foo"},
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			unexpected, stale := compare(testCase.deps, testCase.allowed)
			assert.Equal(t, testCase.unexpected, unexpected)
			assert.Equal(t, testCase.stale, stale)
		})
	}
}

func TestParseAllowlist(t *testing.T) {
	allowed, err := parseAllowlist(strings.NewReader("# comment\n\ngithub.com/fuseone-io/fusescope-otel-collector/utils\n  github.com/fuseone-io/fusescope-otel-collector/constants  \n"))
	require.NoError(t, err)
	assert.Equal(t, []string{"github.com/fuseone-io/fusescope-otel-collector/utils", "github.com/fuseone-io/fusescope-otel-collector/constants"}, allowed)
}

func TestParseAllowlistRejectsDuplicates(t *testing.T) {
	_, err := parseAllowlist(strings.NewReader("github.com/fuseone-io/fusescope-otel-collector/utils\ngithub.com/fuseone-io/fusescope-otel-collector/utils\n"))
	assert.ErrorContains(t, err, "duplicate")
}
