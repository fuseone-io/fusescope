package main

import (
	"encoding/json"
	"flag"
	"io"
	"os"
	"path/filepath"
	"time"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/parity/parityrun"
)

// ErrCodePeriodNotPassing is a period whose verdict does not pass the phase 1 exit.
var ErrCodePeriodNotPassing = errors.MustNewCode("parity_period_not_passing")

// period judges the 14 UTC days ending on -end from the reports under -reports, laid out as the
// bucket keeps them, and prints the verdict as JSON. It fails when the period does not pass, and
// before printing anything when a report of the period is not whole.
func period(args []string, stdout, stderr io.Writer) error {
	flags := flag.NewFlagSet("period", flag.ContinueOnError)
	flags.SetOutput(stderr)
	reports := flags.String("reports", "", "the directory holding the bucket's reports/ tree")
	endDay := flags.String("end", "", "the period's last UTC day, YYYY-MM-DD; yesterday by default")
	if err := flags.Parse(args); err != nil {
		return err
	}
	end, err := periodEnd(*endDay, time.Now())
	if err != nil {
		return err
	}
	rounds, err := periodRounds(*reports, end)
	if err != nil {
		return err
	}
	verdict := parityrun.EvaluatePeriodRounds(end, rounds)
	encoder := json.NewEncoder(stdout)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(verdict); err != nil {
		return errors.WrapInternalf(err, errors.CodeInternal, "the verdict does not print")
	}
	if !verdict.Passed {
		return errors.Newf(errors.TypeInvalidInput, ErrCodePeriodNotPassing, "the period does not pass")
	}
	return nil
}

// periodEnd is the period's last UTC day: day, or the day before now.
func periodEnd(day string, now time.Time) (time.Time, error) {
	if day == "" {
		return now.UTC().Truncate(24*time.Hour).AddDate(0, 0, -1), nil
	}
	end, err := time.Parse(time.DateOnly, day)
	if err != nil {
		return time.Time{}, errors.WrapInvalidInputf(err, errors.CodeInvalidInput, "-end is not YYYY-MM-DD")
	}
	return end, nil
}

// periodRounds reads every report of the 14 days ending on end.
func periodRounds(dir string, end time.Time) ([]parityrun.PeriodRound, error) {
	var rounds []parityrun.PeriodRound
	for i := 13; i >= 0; i-- {
		day := end.AddDate(0, 0, -i)
		paths, err := filepath.Glob(filepath.Join(dir, "reports", day.Format("2006"), day.Format("01"), day.Format("02"), "*.jsonl"))
		if err != nil {
			return nil, errors.WrapInvalidInputf(err, errors.CodeInvalidInput, "the reports directory does not list")
		}
		for _, path := range paths {
			round, err := readPeriodRound(path)
			if err != nil {
				return nil, err
			}
			rounds = append(rounds, round)
		}
	}
	return rounds, nil
}

func readPeriodRound(path string) (parityrun.PeriodRound, error) {
	f, err := os.Open(path)
	if err != nil {
		return parityrun.PeriodRound{}, errors.WrapInvalidInputf(err, errors.CodeInvalidInput, "a report does not open")
	}
	defer f.Close()
	return parityrun.ReadPeriodRound(f)
}
