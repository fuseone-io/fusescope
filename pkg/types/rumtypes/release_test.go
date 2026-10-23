package rumtypes

import (
	"slices"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestCompareReleases(t *testing.T) {
	testCases := []struct {
		name     string
		releases []string
		expected []string
	}{
		{name: "Semver_NumericNotText", releases: []string{"10.0.0", "9.0.0", "9.10.0", "9.2.0"}, expected: []string{"9.0.0", "9.2.0", "9.10.0", "10.0.0"}},
		{name: "Semver_VPrefixAndBuildIgnored", releases: []string{"v1.10.0", "1.9.0+build.7", "v1.2.0"}, expected: []string{"v1.2.0", "1.9.0+build.7", "v1.10.0"}},
		{name: "Semver_PrereleaseBeforeRelease", releases: []string{"1.0.0", "1.0.0-rc.10", "1.0.0-rc.2", "1.0.0-beta"}, expected: []string{"1.0.0-beta", "1.0.0-rc.2", "1.0.0-rc.10", "1.0.0"}},
		{name: "Semver_ShortVersions", releases: []string{"2", "1.10", "1.9.1"}, expected: []string{"1.9.1", "1.10", "2"}},
		{name: "NonSemver_TextBelowSemver", releases: []string{"1.0.0", "main-b2", "main-a1", "0.9.0"}, expected: []string{"main-a1", "main-b2", "0.9.0", "1.0.0"}},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			sorted := slices.Clone(testCase.releases)
			slices.SortFunc(sorted, CompareReleases)
			assert.Equal(t, testCase.expected, sorted)
		})
	}
}
