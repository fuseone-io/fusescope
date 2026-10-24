package main

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestCollectorPackages(t *testing.T) {
	testCases := []struct {
		name   string
		deps   []string
		linked []string
	}{
		{
			name: "NoCollectorDeps_Pass",
			deps: []string{"github.com/fuseone-io/fusescope/pkg/errors", "github.com/other/module"},
		},
		{
			name:   "CollectorImport_Reported",
			deps:   []string{"github.com/fuseone-io/fusescope-otel-collector/utils", "github.com/other/module", "github.com/fuseone-io/fusescope-otel-collector/pkg/keycheck"},
			linked: []string{"github.com/fuseone-io/fusescope-otel-collector/pkg/keycheck", "github.com/fuseone-io/fusescope-otel-collector/utils"},
		},
		{
			name:   "ModuleRoot_Reported",
			deps:   []string{"github.com/fuseone-io/fusescope-otel-collector"},
			linked: []string{"github.com/fuseone-io/fusescope-otel-collector"},
		},
		{
			name: "SimilarModuleName_Ignored",
			deps: []string{"github.com/fuseone-io/fusescope-otel-collectorx/foo"},
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			assert.Equal(t, testCase.linked, collectorPackages(testCase.deps))
		})
	}
}
