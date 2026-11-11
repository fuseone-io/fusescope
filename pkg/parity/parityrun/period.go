package parityrun

import (
	"slices"
	"time"
)

// The reasons a period does not pass the phase 1 exit.
const (
	PeriodTooShort         = "period_too_short"
	PeriodDayMissing       = "day_missing"
	PeriodDayNotQualifying = "day_not_qualifying"
	PeriodViewUnderMinimum = "view_under_minimum"
)

const (
	// periodDays is how many consecutive days the exit needs.
	periodDays = 14
	// periodMinSuccessful is the successful pairs each view needs over the period.
	periodMinSuccessful = 200
)

// DayRounds are the summaries of the rounds of one UTC day.
type DayRounds struct {
	Day    time.Time
	Rounds []Summary
}

// EvaluatePeriod tells whether the last 14 days pass the phase 1 exit: 14 consecutive UTC days,
// each with at least one round and every round of it qualifying, and at least 200 successful pairs
// of every view over the 14. A round qualifies only under the daily thresholds applied to itself,
// so a qualifying day is at least as strict as the daily criteria.
func EvaluatePeriod(days []DayRounds) (bool, []string) {
	var reasons []string
	add := func(r string) {
		if !slices.Contains(reasons, r) {
			reasons = append(reasons, r)
		}
	}
	sorted := slices.Clone(days)
	slices.SortFunc(sorted, func(a, b DayRounds) int { return a.Day.Compare(b.Day) })
	if len(sorted) < periodDays {
		return false, []string{PeriodTooShort}
	}
	last := sorted[len(sorted)-periodDays:]
	successful := map[string]int{}
	for i, d := range last {
		day := d.Day.UTC().Truncate(24 * time.Hour)
		if i > 0 && !day.Equal(last[i-1].Day.UTC().Truncate(24*time.Hour).AddDate(0, 0, 1)) {
			add(PeriodDayMissing)
		}
		if len(d.Rounds) == 0 {
			add(PeriodDayMissing)
		}
		for _, round := range d.Rounds {
			if !round.Qualifying {
				add(PeriodDayNotQualifying)
			}
			for _, c := range round.Coverage {
				successful[c.View] += c.Successful
			}
		}
	}
	for _, n := range successful {
		if n < periodMinSuccessful {
			add(PeriodViewUnderMinimum)
		}
	}
	return len(reasons) == 0, reasons
}
