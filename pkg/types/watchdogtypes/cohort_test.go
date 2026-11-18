package watchdogtypes

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

// steady is a service with the given requests in every bucket of the window.
func steady(requests ...float64) *REDSeries {
	red := &REDSeries{Requests: map[int64]float64{}, Errors: map[int64]float64{}, P99: map[int64]float64{}}
	for i, timestamp := range testWindow.Buckets() {
		if i < len(requests) {
			red.Requests[timestamp] = requests[i]
			red.Errors[timestamp] = 0
			red.P99[timestamp] = 1e6
		}
	}
	return red
}

// seasonsOf spreads per-service volumes over four seasons: volumes[service][k]
// is the per-bucket request count of season k+1, a negative count leaving the
// season out.
func seasonsOf(volumes map[string][Seasons]float64) []*REDResult {
	seasons := make([]*REDResult, Seasons)
	for k := range seasons {
		seasons[k] = &REDResult{Services: map[string]*REDSeries{}}
		for service, perSeason := range volumes {
			if perSeason[k] >= 0 {
				seasons[k].Services[service] = steady(perSeason[k], perSeason[k], perSeason[k])
			}
		}
	}
	return seasons
}

func TestNewCohort(t *testing.T) {
	testCases := []struct {
		name      string
		active    []string
		seasons   []*REDResult
		maxSeries int
		batches   []Batch
		overflow  int
	}{
		{
			name:      "ActiveWithoutCurrentVolume_Stays",
			active:    []string{"quiet"},
			seasons:   seasonsOf(map[string][Seasons]float64{"quiet": {10, 10, 10, 10}, "busy": {900, 900, 900, 900}}),
			maxSeries: 2,
			batches:   []Batch{{Services: []string{"quiet", "busy"}}},
		},
		{
			name:   "TopN_ByBaselineMedian",
			active: nil,
			seasons: seasonsOf(map[string][Seasons]float64{
				"spiky":  {5, 5, 5, 9000},
				"steady": {100, 100, 100, 100},
				"medium": {50, 60, 40, 50},
			}),
			maxSeries: 2,
			batches:   []Batch{{Services: []string{"steady", "medium"}}},
		},
		{
			name:   "CandidateWithNineOfTwelveBuckets_Excluded",
			active: nil,
			seasons: func() []*REDResult {
				seasons := seasonsOf(map[string][Seasons]float64{"sparse": {1000, 1000, 1000, 1000}, "full": {10, 10, 10, 10}})
				seasons[3].Services["sparse"] = &REDSeries{Requests: map[int64]float64{}}
				return seasons
			}(),
			maxSeries: 5,
			batches:   []Batch{{Services: []string{"full"}}},
		},
		{
			name:   "CandidateWithTenOfTwelveBuckets_Included",
			active: nil,
			seasons: func() []*REDResult {
				seasons := seasonsOf(map[string][Seasons]float64{"gappy": {10, 10, 10, 10}})
				seasons[2].Services["gappy"] = steady(10, 10)
				seasons[3].Services["gappy"] = steady(10, 10)
				return seasons
			}(),
			maxSeries: 5,
			batches:   []Batch{{Services: []string{"gappy"}}},
		},
		{
			name:      "ActiveWithoutBaseline_InCohortWithoutRefetch",
			active:    []string{"gone"},
			seasons:   seasonsOf(map[string][Seasons]float64{"other": {10, 10, 10, 10}}),
			maxSeries: 5,
			batches:   []Batch{{Services: []string{"gone", "other"}}},
		},
		{
			name:      "ActiveMissingFromTruncatedSeason_Refetched",
			active:    []string{"tail"},
			seasons:   seasonsOf(map[string][Seasons]float64{"head": {50, 50, 50, 50}, "tail": {5, 5, 5, -1}}),
			maxSeries: 1,
			batches:   []Batch{{Services: []string{"tail"}, Refetch: []string{"tail"}}},
		},
		{
			name:      "ActivesAboveMaxSeries_ExtraBatches",
			active:    []string{"e", "d", "c", "b", "a"},
			seasons:   seasonsOf(map[string][Seasons]float64{"new": {999, 999, 999, 999}}),
			maxSeries: 2,
			batches:   []Batch{{Services: []string{"a", "b"}}, {Services: []string{"c", "d"}}, {Services: []string{"e"}}},
			overflow:  3,
		},
		{
			name:      "MaxSeriesCountsServices_NotAggregations",
			active:    nil,
			seasons:   seasonsOf(map[string][Seasons]float64{"x": {30, 30, 30, 30}, "y": {20, 20, 20, 20}, "z": {10, 10, 10, 10}}),
			maxSeries: 3,
			batches:   []Batch{{Services: []string{"x", "y", "z"}}},
		},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			cohort := NewCohort(testWindow, testCase.active, testCase.seasons, testCase.maxSeries)
			assert.Equal(t, testCase.batches, cohort.Batches)
			assert.Equal(t, testCase.overflow, cohort.ActiveOverflow)
		})
	}
}

func TestPredictedVolume(t *testing.T) {
	testCases := []struct {
		name      string
		baselines []*REDSeries
		volume    float64
	}{
		{name: "FourSeasons_Median", baselines: []*REDSeries{steady(10, 10, 10), steady(20, 20, 20), steady(30, 30, 30), steady(1000, 1000, 1000)}, volume: 75},
		{name: "MissingSeason_MedianOfPresent", baselines: []*REDSeries{steady(10, 10, 10), nil, steady(30, 30, 30), nil}, volume: 60},
		{name: "NoSeason_Zero", baselines: []*REDSeries{nil, nil, nil, nil}, volume: 0},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			assert.InDelta(t, testCase.volume, PredictedVolume(testWindow, testCase.baselines), 1e-9)
		})
	}
}
