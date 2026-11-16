package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/parity/parityrun"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

var periodViews = []string{parityrun.ViewServices, parityrun.ViewTopOperations, parityrun.ViewEntryOperations, parityrun.ViewSpanList, parityrun.ViewTimeSeries, parityrun.ViewScalar, parityrun.ViewAbsentKey, parityrun.ViewSummary, parityrun.ViewWaterfall}

// writeReport writes a whole report of a qualifying round started on day, where the bucket keeps it.
func writeReport(t *testing.T, dir string, day time.Time, n int) {
	t.Helper()
	runID := fmt.Sprintf("%st030000z-%d", day.Format("20060102"), n)
	key, err := parityrun.ReportKey(runID)
	require.NoError(t, err)
	path := filepath.Join(dir, filepath.FromSlash(key))
	require.NoError(t, os.MkdirAll(filepath.Dir(path), 0o700))
	header, err := json.Marshal(parityrun.Header{Kind: "header", Format: parityrun.ReportFormat, RunID: runID, BackendCommit: "ed3d4c0e", ImageDigest: "sha256:5d3e", EngineVersion: "0.0.9"})
	require.NoError(t, err)
	summary := parityrun.Summary{Kind: "summary", Usable: true, Qualifying: true}
	for _, view := range periodViews {
		summary.Coverage = append(summary.Coverage, parityrun.CoverageView{View: view, Planned: 15, Reached: 15, Successful: 15})
	}
	closing, err := json.Marshal(summary)
	require.NoError(t, err)
	require.NoError(t, os.WriteFile(path, append(append(header, '\n'), append(closing, '\n')...), 0o600))
}

func TestAPeriodOfFourteenQualifyingDaysPasses(t *testing.T) {
	dir := t.TempDir()
	end := time.Date(2026, 11, 30, 0, 0, 0, 0, time.UTC)
	for i := range 14 {
		writeReport(t, dir, end.AddDate(0, 0, -i), 1)
	}
	writeReport(t, dir, end.AddDate(0, 0, -3), 2)

	var out, errOut bytes.Buffer
	require.NoError(t, run([]string{"period", "-reports", dir, "-end", "2026-11-30"}, &out, &errOut), errOut.String())
	var verdict parityrun.PeriodVerdict
	require.NoError(t, json.Unmarshal(out.Bytes(), &verdict))
	assert.True(t, verdict.Passed)
	assert.Equal(t, 14, verdict.QualifyingStreak)
	assert.Len(t, verdict.Days[10].RunIDs, 2, "both rounds of 27 November")
}

func TestAPeriodThatDoesNotPassFailsWithItsVerdict(t *testing.T) {
	dir := t.TempDir()
	end := time.Date(2026, 11, 30, 0, 0, 0, 0, time.UTC)
	for i := 1; i < 14; i++ {
		writeReport(t, dir, end.AddDate(0, 0, -i), 1)
	}

	var out, errOut bytes.Buffer
	err := run([]string{"period", "-reports", dir, "-end", "2026-11-30"}, &out, &errOut)
	require.Error(t, err)
	assert.True(t, errors.Asc(err, ErrCodePeriodNotPassing), "%v", err)
	var verdict parityrun.PeriodVerdict
	require.NoError(t, json.Unmarshal(out.Bytes(), &verdict), "the verdict is printed all the same")
	assert.Contains(t, verdict.Reasons, parityrun.PeriodDayMissing)
	assert.Equal(t, 0, verdict.QualifyingStreak)
}

func TestAnUnreadableReportFailsThePeriod(t *testing.T) {
	dir := t.TempDir()
	end := time.Date(2026, 11, 30, 0, 0, 0, 0, time.UTC)
	for i := range 14 {
		writeReport(t, dir, end.AddDate(0, 0, -i), 1)
	}
	key, err := parityrun.ReportKey("20261125t040000z-9")
	require.NoError(t, err)
	require.NoError(t, os.WriteFile(filepath.Join(dir, filepath.FromSlash(key)), []byte(`{"kind":"header","format":1}`+"\n"), 0o600))

	var out, errOut bytes.Buffer
	err = run([]string{"period", "-reports", dir, "-end", "2026-11-30"}, &out, &errOut)
	require.Error(t, err, "a report without its summary is never skipped")
	assert.False(t, errors.Asc(err, ErrCodePeriodNotPassing))
	assert.Empty(t, out.String())
}

func TestThePeriodEndsYesterdayByDefault(t *testing.T) {
	now := time.Date(2026, 12, 1, 9, 30, 0, 0, time.UTC)
	end, err := periodEnd("", now)
	require.NoError(t, err)
	assert.Equal(t, time.Date(2026, 11, 30, 0, 0, 0, 0, time.UTC), end)
	_, err = periodEnd("30/11/2026", now)
	assert.Error(t, err)
}
