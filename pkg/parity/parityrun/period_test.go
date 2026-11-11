package parityrun

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

var allViews = []string{ViewServices, ViewTopOperations, ViewEntryOperations, ViewSpanList, ViewTimeSeries, ViewScalar, ViewAbsentKey, ViewSummary, ViewWaterfall}

func qualifyingRound(successful int) Summary {
	s := Summary{Usable: true, Qualifying: true}
	for _, v := range allViews {
		s.Coverage = append(s.Coverage, CoverageView{View: v, Planned: successful, Reached: successful, Successful: successful})
	}
	return s
}

func days(n int, round func(day int) []Summary) []DayRounds {
	start := time.Date(2026, 11, 1, 0, 0, 0, 0, time.UTC)
	out := make([]DayRounds, 0, n)
	for i := 0; i < n; i++ {
		out = append(out, DayRounds{Day: start.AddDate(0, 0, i), Rounds: round(i)})
	}
	return out
}

func TestFourteenQualifyingDaysPassThePhase(t *testing.T) {
	ok, reasons := EvaluatePeriod(days(14, func(int) []Summary { return []Summary{qualifyingRound(15)} }))
	assert.True(t, ok, "%v", reasons)
}

func TestThePeriodNeedsFourteenConsecutiveQualifyingDays(t *testing.T) {
	ok, reasons := EvaluatePeriod(days(13, func(int) []Summary { return []Summary{qualifyingRound(16)} }))
	assert.False(t, ok)
	assert.Contains(t, reasons, PeriodTooShort)

	gap := days(15, func(int) []Summary { return []Summary{qualifyingRound(15)} })
	gap = append(gap[:7], gap[8:]...)
	ok, reasons = EvaluatePeriod(gap)
	assert.False(t, ok)
	assert.Contains(t, reasons, PeriodDayMissing)

	ok, reasons = EvaluatePeriod(days(14, func(day int) []Summary {
		if day == 3 {
			return []Summary{qualifyingRound(15), {Usable: true}}
		}
		return []Summary{qualifyingRound(15)}
	}))
	assert.False(t, ok, "one round that does not qualify fails its day")
	assert.Contains(t, reasons, PeriodDayNotQualifying)

	ok, reasons = EvaluatePeriod(days(14, func(day int) []Summary {
		if day == 5 {
			return nil
		}
		return []Summary{qualifyingRound(15)}
	}))
	assert.False(t, ok, "a day without a round")
	assert.Contains(t, reasons, PeriodDayMissing)
}

func TestEveryViewNeedsTwoHundredSuccessfulPairsOverThePeriod(t *testing.T) {
	ok, reasons := EvaluatePeriod(days(14, func(int) []Summary { return []Summary{qualifyingRound(14)} }))
	assert.False(t, ok, "14 × 14 = 196")
	assert.Contains(t, reasons, PeriodViewUnderMinimum)
}

func TestRoundsWithoutCoverageNeverPassThePeriod(t *testing.T) {
	ok, reasons := EvaluatePeriod(days(14, func(int) []Summary { return []Summary{{Usable: true, Qualifying: true}} }))
	assert.False(t, ok, "fourteen empty qualifying summaries")
	assert.Contains(t, reasons, PeriodViewUnderMinimum)

	missing := func(int) []Summary {
		s := qualifyingRound(20)
		s.Coverage = s.Coverage[1:]
		return []Summary{s}
	}
	ok, reasons = EvaluatePeriod(days(14, missing))
	assert.False(t, ok, "a view never compared")
	assert.Contains(t, reasons, PeriodViewUnderMinimum)
}
