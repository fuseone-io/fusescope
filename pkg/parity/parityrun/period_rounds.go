package parityrun

import (
	"io"
	"slices"
	"time"

	"github.com/fuseone-io/fusescope/pkg/errors"
)

// PeriodPinsChanged is a period whose rounds ran different backend, parity image or engine pins: an
// upgrade restarts the count on the next whole UTC day.
const PeriodPinsChanged = "pins_changed"

// Pins are what a round ran: the backend commit, the parity image and the engine release.
type Pins struct {
	BackendCommit string `json:"backend_commit"`
	ImageDigest   string `json:"image_digest"`
	EngineVersion string `json:"engine_version"`
}

// PeriodRound is one published round as the period reads it.
type PeriodRound struct {
	RunID   string
	Pins    Pins
	Summary Summary
}

// PeriodDay is one UTC day of a period: the rounds started on it and whether they all qualified.
type PeriodDay struct {
	Day        time.Time        `json:"day"`
	Rounds     []PeriodDayRound `json:"rounds"`
	Qualifying bool             `json:"qualifying"`
}

// PeriodDayRound is one round of a day, as its summary judged it.
type PeriodDayRound struct {
	RunID      string   `json:"run_id"`
	Qualifying bool     `json:"qualifying"`
	Reasons    []string `json:"reasons,omitempty"`
}

// PeriodVerdict is a period's verdict, day by day, and how many days up to its last qualified in a
// row on the last day's pins.
type PeriodVerdict struct {
	Passed           bool        `json:"passed"`
	Reasons          []string    `json:"reasons,omitempty"`
	Pins             []Pins      `json:"pins"`
	Days             []PeriodDay `json:"days"`
	QualifyingStreak int         `json:"qualifying_streak"`
}

// ReadPeriodRound reads one published report for the period.
//
// # Errors
//
// A report that is not whole: no header of format 1, an unknown line, or no summary.
func ReadPeriodRound(r io.Reader) (PeriodRound, error) {
	header, _, summary, err := parseReport(r)
	if err != nil {
		return PeriodRound{}, err
	}
	return PeriodRound{
		RunID:   header.RunID,
		Pins:    Pins{BackendCommit: header.BackendCommit, ImageDigest: header.ImageDigest, EngineVersion: header.EngineVersion},
		Summary: summary,
	}, nil
}

// RoundDay is the UTC day a round started on, from its run id.
//
// # Errors
//
// A run id that is not one.
func RoundDay(runID string) (time.Time, error) {
	m := runIDDate.FindStringSubmatch(runID)
	if m == nil {
		return time.Time{}, errors.Newf(errors.TypeInvalidInput, ErrCodeReport, "not a run id")
	}
	return time.Parse("20060102", m[1]+m[2]+m[3])
}

// EvaluatePeriodRounds judges the 14 UTC days ending on end's day: each day holds the rounds whose
// run id names it, so a day with none fails the period wherever it falls, and every round must run
// the same pins. Rounds outside the 14 days, or whose run id is not one, are left out.
func EvaluatePeriodRounds(end time.Time, rounds []PeriodRound) PeriodVerdict {
	last := end.UTC().Truncate(24 * time.Hour)
	first := last.AddDate(0, 0, 1-periodDays)
	days := make([]DayRounds, periodDays)
	dayPins := make([][]Pins, periodDays)
	verdict := PeriodVerdict{Days: make([]PeriodDay, periodDays)}
	for i := range days {
		days[i].Day = first.AddDate(0, 0, i)
		verdict.Days[i].Day = days[i].Day
	}
	for _, round := range rounds {
		day, err := RoundDay(round.RunID)
		if err != nil || day.Before(first) || day.After(last) {
			continue
		}
		i := int(day.Sub(first) / (24 * time.Hour))
		days[i].Rounds = append(days[i].Rounds, round.Summary)
		verdict.Days[i].Rounds = append(verdict.Days[i].Rounds, PeriodDayRound{
			RunID: round.RunID, Qualifying: round.Summary.Qualifying, Reasons: round.Summary.Reasons,
		})
		if !slices.Contains(dayPins[i], round.Pins) {
			dayPins[i] = append(dayPins[i], round.Pins)
		}
		if !slices.Contains(verdict.Pins, round.Pins) {
			verdict.Pins = append(verdict.Pins, round.Pins)
		}
	}
	verdict.Passed, verdict.Reasons = EvaluatePeriod(days)
	if len(verdict.Pins) > 1 {
		verdict.Passed = false
		verdict.Reasons = append(verdict.Reasons, PeriodPinsChanged)
	}
	for i, day := range days {
		verdict.Days[i].Qualifying = len(day.Rounds) > 0 && !slices.ContainsFunc(day.Rounds, func(s Summary) bool { return !s.Qualifying })
	}
	verdict.QualifyingStreak = streak(verdict.Days, dayPins)
	return verdict
}

// streak counts the qualifying days back from the last that ran only the last day's pins.
func streak(days []PeriodDay, dayPins [][]Pins) int {
	last := len(days) - 1
	if len(dayPins[last]) != 1 {
		return 0
	}
	n := 0
	for i := last; i >= 0 && days[i].Qualifying && slices.Equal(dayPins[i], dayPins[last]); i-- {
		n++
	}
	return n
}
