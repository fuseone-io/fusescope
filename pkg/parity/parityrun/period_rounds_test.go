package parityrun

import (
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

var periodPins = Pins{BackendCommit: "ed3d4c0e", ImageDigest: "sha256:5d3e", EngineVersion: "0.0.9"}

// roundOn is a qualifying round started at 03:00 on the UTC day day, with successful pairs per view.
func roundOn(day time.Time, successful int) PeriodRound {
	return PeriodRound{RunID: day.Format("20060102") + "t030000z-1", Pins: periodPins, Summary: qualifyingRound(successful)}
}

func fortnight(end time.Time, successful int) []PeriodRound {
	rounds := make([]PeriodRound, 0, periodDays)
	for i := periodDays - 1; i >= 0; i-- {
		rounds = append(rounds, roundOn(end.AddDate(0, 0, -i), successful))
	}
	return rounds
}

func TestThePeriodIsTheFourteenUTCDaysEndingOnItsLastDay(t *testing.T) {
	end := time.Date(2026, 11, 30, 0, 0, 0, 0, time.UTC)
	verdict := EvaluatePeriodRounds(end, fortnight(end, 15))
	assert.True(t, verdict.Passed, "%v", verdict.Reasons)
	require.Len(t, verdict.Days, periodDays)
	assert.Equal(t, time.Date(2026, 11, 17, 0, 0, 0, 0, time.UTC), verdict.Days[0].Day)
	assert.Equal(t, end, verdict.Days[periodDays-1].Day)
	assert.Equal(t, periodDays, verdict.QualifyingStreak)

	older := append([]PeriodRound{{RunID: "20261116t030000z-1", Pins: periodPins}}, fortnight(end, 15)...)
	assert.True(t, EvaluatePeriodRounds(end, older).Passed, "a round before the period does not count")
}

func TestADayWithoutARoundAtTheEndFailsThePeriod(t *testing.T) {
	end := time.Date(2026, 11, 30, 0, 0, 0, 0, time.UTC)
	rounds := fortnight(end.AddDate(0, 0, -1), 15)
	verdict := EvaluatePeriodRounds(end, rounds)
	assert.False(t, verdict.Passed)
	assert.Contains(t, verdict.Reasons, PeriodDayMissing)
	assert.Equal(t, 0, verdict.QualifyingStreak, "the last day has no round")
}

func TestARoundCountsOnTheUTCDayItStarted(t *testing.T) {
	end := time.Date(2026, 11, 30, 0, 0, 0, 0, time.UTC)
	rounds := fortnight(end, 15)
	rounds[13].RunID = "20261130t235959z-7"
	rounds = append(rounds, PeriodRound{RunID: "20261201t000000z-8", Pins: periodPins})
	verdict := EvaluatePeriodRounds(end, rounds)
	assert.True(t, verdict.Passed, "a round of the next day is outside the period: %v", verdict.Reasons)
	assert.Equal(t, []string{"20261130t235959z-7"}, verdict.Days[13].RunIDs)
}

func TestEveryRoundOfThePeriodKeepsTheSamePins(t *testing.T) {
	end := time.Date(2026, 11, 30, 0, 0, 0, 0, time.UTC)
	for _, change := range []func(*Pins){
		func(p *Pins) { p.BackendCommit = "3923ebc0" },
		func(p *Pins) { p.ImageDigest = "sha256:bef2" },
		func(p *Pins) { p.EngineVersion = "0.0.10" },
	} {
		rounds := fortnight(end, 15)
		change(&rounds[6].Pins)
		verdict := EvaluatePeriodRounds(end, rounds)
		assert.False(t, verdict.Passed)
		assert.Contains(t, verdict.Reasons, PeriodPinsChanged)
	}
}

func TestTheStreakCountsTheQualifyingDaysUpToTheLastDay(t *testing.T) {
	end := time.Date(2026, 11, 30, 0, 0, 0, 0, time.UTC)
	rounds := fortnight(end, 15)
	rounds[9].Summary = Summary{Usable: true}
	verdict := EvaluatePeriodRounds(end, rounds)
	assert.False(t, verdict.Passed)
	assert.Contains(t, verdict.Reasons, PeriodDayNotQualifying)
	assert.Equal(t, 4, verdict.QualifyingStreak, "days 10 to 13 qualify after day 9")
	assert.False(t, verdict.Days[9].Qualifying)
}

func TestAPeriodReadsAWholeReportOnly(t *testing.T) {
	header := `{"kind":"header","format":1,"run_id":"20261130t030000z-1","backend_commit":"ed3d4c0e","image_digest":"sha256:5d3e","engine_version":"0.0.9"}`
	summary := `{"kind":"summary","usable":true,"qualifying":true,"coverage":[{"view":"services","planned":1,"reached":1,"successful":1}]}`

	round, err := ReadPeriodRound(strings.NewReader(header + "\n" + summary + "\n"))
	require.NoError(t, err)
	assert.Equal(t, PeriodRound{RunID: "20261130t030000z-1", Pins: periodPins, Summary: Summary{Kind: "summary", Usable: true, Qualifying: true, Coverage: []CoverageView{{View: "services", Planned: 1, Reached: 1, Successful: 1}}}}, round)

	_, err = ReadPeriodRound(strings.NewReader(header + "\n"))
	assert.Error(t, err, "a report without its summary")
}

func TestThePeriodCountsTheSuccessfulPairsOfItsFourteenDaysOnly(t *testing.T) {
	end := time.Date(2026, 11, 30, 0, 0, 0, 0, time.UTC)
	rounds := append(fortnight(end.AddDate(0, 0, -14), 100), fortnight(end, 14)...)
	verdict := EvaluatePeriodRounds(end, rounds)
	assert.False(t, verdict.Passed, "14 × 14 = 196; the fortnight before does not count")
	assert.Contains(t, verdict.Reasons, PeriodViewUnderMinimum)
}
