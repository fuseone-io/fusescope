package rumtypes

import (
	"testing"
	"time"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNewQueryRange(t *testing.T) {
	now := time.Date(2026, 10, 22, 12, 0, 0, 0, time.UTC)
	testCases := []struct {
		name     string
		params   QueryableRange
		expected QueryRange
		invalid  bool
	}{
		{name: "Defaults_Last24Hours", params: QueryableRange{}, expected: QueryRange{Start: now.Add(-24 * time.Hour), End: now}},
		{name: "OnlyEnd_24HoursBefore", params: QueryableRange{End: now.Add(-time.Hour).UnixMilli()}, expected: QueryRange{Start: now.Add(-25 * time.Hour), End: now.Add(-time.Hour)}},
		{name: "Explicit_WithFilters", params: QueryableRange{Start: now.Add(-time.Hour).UnixMilli(), End: now.UnixMilli(), Release: "1.8.0", Environment: "production"}, expected: QueryRange{Start: now.Add(-time.Hour), End: now, Release: "1.8.0", Environment: "production"}},
		{name: "StartAfterEnd_Invalid", params: QueryableRange{Start: now.UnixMilli(), End: now.Add(-time.Hour).UnixMilli()}, invalid: true},
		{name: "TooLong_Invalid", params: QueryableRange{Start: now.Add(-32 * 24 * time.Hour).UnixMilli(), End: now.UnixMilli()}, invalid: true},
		{name: "Negative_Invalid", params: QueryableRange{Start: -1, End: now.UnixMilli()}, invalid: true},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			queryRange, err := NewQueryRange(testCase.params, now)
			if testCase.invalid {
				assert.True(t, errors.Ast(err, errors.TypeInvalidInput))
				return
			}
			require.NoError(t, err)
			assert.Equal(t, testCase.expected, queryRange)
		})
	}
}

func TestNewPage(t *testing.T) {
	testCases := []struct {
		name     string
		limit    int
		offset   int
		max      int
		expected Page
		invalid  bool
	}{
		{name: "Defaults", max: 200, expected: Page{Limit: 50}},
		{name: "Explicit", limit: 10, offset: 20, max: 200, expected: Page{Limit: 10, Offset: 20}},
		{name: "AboveMax_Invalid", limit: 201, max: 200, invalid: true},
		{name: "NegativeOffset_Invalid", offset: -1, max: 200, invalid: true},
		{name: "OffsetTooDeep_Invalid", limit: 50, offset: 10001, max: 200, invalid: true},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			page, err := NewPage(testCase.limit, testCase.offset, testCase.max)
			if testCase.invalid {
				assert.True(t, errors.Ast(err, errors.TypeInvalidInput))
				return
			}
			require.NoError(t, err)
			assert.Equal(t, testCase.expected, page)
		})
	}
}

func TestNewSeriesStep(t *testing.T) {
	testCases := []struct {
		name     string
		span     time.Duration
		expected time.Duration
	}{
		{name: "FifteenMinutes", span: 15 * time.Minute, expected: time.Minute},
		{name: "OneHour", span: time.Hour, expected: 5 * time.Minute},
		{name: "SixHours", span: 6 * time.Hour, expected: 15 * time.Minute},
		{name: "OneDay", span: 24 * time.Hour, expected: time.Hour},
		{name: "SevenDays", span: 7 * 24 * time.Hour, expected: 6 * time.Hour},
		{name: "ThirtyOneDays", span: 31 * 24 * time.Hour, expected: 24 * time.Hour},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			assert.Equal(t, testCase.expected, NewSeriesStep(testCase.span))
		})
	}
}

func TestListSessionsParamsFilter(t *testing.T) {
	yes := true
	minimum, maximum := int64(60000), int64(1000)
	testCases := []struct {
		name     string
		params   ListSessionsParams
		expected SessionFilter
		invalid  bool
	}{
		{name: "Empty", params: ListSessionsParams{}, expected: SessionFilter{}},
		{name: "All", params: ListSessionsParams{Browser: "Chrome", Route: "/cart", UserID: "u1", HasError: &yes, MinDurationMs: &minimum}, expected: SessionFilter{Browser: "Chrome", Route: "/cart", UserID: "u1", HasError: &yes, MinDuration: time.Minute}},
		{name: "MinAboveMax_Invalid", params: ListSessionsParams{MinDurationMs: &minimum, MaxDurationMs: &maximum}, invalid: true},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			filter, err := testCase.params.Filter()
			if testCase.invalid {
				assert.True(t, errors.Ast(err, errors.TypeInvalidInput))
				return
			}
			require.NoError(t, err)
			assert.Equal(t, testCase.expected, filter)
		})
	}
}
