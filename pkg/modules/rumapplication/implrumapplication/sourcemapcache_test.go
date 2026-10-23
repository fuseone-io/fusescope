package implrumapplication

import (
	"strings"
	"testing"

	"github.com/fuseone-io/fusescope/pkg/types/rumtypes"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func newTestSourceMap(t *testing.T, contentSize int) *rumtypes.SourceMap {
	t.Helper()
	sourceMap, err := rumtypes.ParseSourceMap([]byte(`{"version":3,"sources":["a.ts"],"sourcesContent":["` + strings.Repeat("x", contentSize) + `"],"names":[],"mappings":"AAAA"}`))
	require.NoError(t, err)
	return sourceMap
}

func TestSourceMapCache(t *testing.T) {
	unit := newTestSourceMap(t, 1000)
	size := unit.Size()

	testCases := []struct {
		name     string
		capacity int64
		run      func(cache *sourceMapCache)
		cached   []string
		missing  []string
	}{
		{
			name:     "UnderCapacity_AllKept",
			capacity: 3 * size,
			run:      func(cache *sourceMapCache) { cache.Add("a", unit); cache.Add("b", unit); cache.Add("c", unit) },
			cached:   []string{"a", "b", "c"},
		},
		{
			name:     "OverCapacity_LeastRecentlyAddedEvicted",
			capacity: 2 * size,
			run:      func(cache *sourceMapCache) { cache.Add("a", unit); cache.Add("b", unit); cache.Add("c", unit) },
			cached:   []string{"b", "c"},
			missing:  []string{"a"},
		},
		{
			name:     "Get_RefreshesRecency",
			capacity: 2 * size,
			run: func(cache *sourceMapCache) {
				cache.Add("a", unit)
				cache.Add("b", unit)
				cache.Get("a")
				cache.Add("c", unit)
			},
			cached:  []string{"a", "c"},
			missing: []string{"b"},
		},
		{
			name:     "LargerThanCapacity_NotCached",
			capacity: size - 1,
			run:      func(cache *sourceMapCache) { cache.Add("a", unit) },
			missing:  []string{"a"},
		},
		{
			name:     "Remove",
			capacity: 3 * size,
			run: func(cache *sourceMapCache) {
				cache.Add("a", unit)
				cache.Add("b", unit)
				cache.Remove("a")
				cache.Remove("missing")
			},
			cached:  []string{"b"},
			missing: []string{"a"},
		},
		{
			name:     "AddTwice_CountedOnce",
			capacity: 2 * size,
			run:      func(cache *sourceMapCache) { cache.Add("a", unit); cache.Add("a", unit); cache.Add("b", unit) },
			cached:   []string{"a", "b"},
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			cache := newSourceMapCache(testCase.capacity)
			testCase.run(cache)
			for _, key := range testCase.cached {
				got, ok := cache.Get(key)
				assert.True(t, ok, key)
				assert.Same(t, unit, got)
			}
			for _, key := range testCase.missing {
				_, ok := cache.Get(key)
				assert.False(t, ok, key)
			}
			assert.LessOrEqual(t, cache.Size(), testCase.capacity)
		})
	}
}
