package parityrun

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/parity"
)

// investigated runs a round where the engine counts one more call, and reads its report back.
func investigated(t *testing.T) (Round, []byte, Header, []PairRecord) {
	t.Helper()
	// Ten services and a sample of two: another seed would sample others.
	services := []string{"s-0", "s-1", "s-2", "s-3", "s-4", "s-5", "s-6", "s-7", "s-8", "s-9"}
	r, keys, _, dir := round(t, &store{p99: 5, extra: 1, services: services}, &store{p99: 5, services: services})
	_, err := r.Run(t.Context())
	require.NoError(t, err)
	files, err := filepath.Glob(filepath.Join(dir, "*.jsonl"))
	require.NoError(t, err)
	f, err := os.Open(files[0])
	require.NoError(t, err)
	defer f.Close()
	header, records, err := ParseReport(f)
	require.NoError(t, err)
	return r, keys.keys[0], header, records
}

func TestAnInvestigationShowsTheValuesBehindTheReportsDifferences(t *testing.T) {
	r, key, header, records := investigated(t)
	r.Seed = 999
	var out bytes.Buffer
	shown, err := r.Investigate(t.Context(), key, Investigation{Header: header, Records: records, Tenant: r.Tenants.Tenants[0], Class: parity.Settled}, &out)
	require.NoError(t, err)
	assert.Positive(t, shown)
	text := out.String()
	assert.Contains(t, text, secretService, "the terminal shows what the report only fingerprinted")
	assert.Contains(t, text, "numCalls")
	assert.Contains(t, text, "engine: 6")
	assert.Contains(t, text, "clickhouse: 5")
	assert.NotContains(t, text, "not reproduced", "the report's seed and sample, not the round's own, plan the window again")
}

func TestAnInvestigationShowsOnlyWhatTheReportRecorded(t *testing.T) {
	r, key, header, records := investigated(t)
	for i := range records {
		records[i].Differences = nil
	}
	var out bytes.Buffer
	shown, err := r.Investigate(t.Context(), key, Investigation{Header: header, Records: records, Tenant: r.Tenants.Tenants[0], Class: parity.Settled}, &out)
	require.NoError(t, err)
	assert.Zero(t, shown)
	assert.NotContains(t, out.String(), "engine: 6")
}

func TestAnInvestigationRefusesAWrongKeyBeforeAnyQuery(t *testing.T) {
	r, key, header, records := investigated(t)
	wrong := bytes.Clone(key)
	wrong[0] ^= 1
	engine := &store{p99: 5}
	r.Engine = graphOf(engine)
	_, err := r.Investigate(t.Context(), wrong, Investigation{Header: header, Records: records, Tenant: r.Tenants.Tenants[0], Class: parity.Settled}, &bytes.Buffer{})
	require.Error(t, err)
	assert.True(t, errors.Ast(err, errors.TypeForbidden), "refused as a wrong key: %v", err)
}

func TestAnInvestigationSaysWhenARecordedDifferenceIsNotFoundNow(t *testing.T) {
	r, key, header, records := investigated(t)
	for i := range records {
		for j := range records[i].Differences {
			// A path an older comparison recorded, which this one no longer produces.
			records[i].Differences[j].Path = "data[3].numCalls"
		}
	}
	var out bytes.Buffer
	shown, err := r.Investigate(t.Context(), key, Investigation{Header: header, Records: records, Tenant: r.Tenants.Tenants[0], Class: parity.Settled}, &out)
	require.NoError(t, err)
	assert.Zero(t, shown)
	assert.Contains(t, out.String(), "recorded differences not found now", "never silent, as if the differences were gone")
}

func TestAnInvestigationFlagsWhatItCannotReproduce(t *testing.T) {
	r, key, header, records := investigated(t)
	for i := range records {
		if records[i].Outcome == "differ" {
			records[i].Params = "a fingerprint no pair has now"
		}
	}
	var out bytes.Buffer
	shown, err := r.Investigate(t.Context(), key, Investigation{Header: header, Records: records, Tenant: r.Tenants.Tenants[0], Class: parity.Settled}, &out)
	require.NoError(t, err)
	assert.Zero(t, shown)
	assert.Contains(t, out.String(), "not reproduced")
}

func TestAReportIsReadBackWhole(t *testing.T) {
	_, _, err := ParseReport(strings.NewReader(`{"kind":"pair"}` + "\n"))
	assert.Error(t, err, "a report opens with its header")
	_, _, err = ParseReport(strings.NewReader(`{"kind":"header","format":2}` + "\n"))
	assert.Error(t, err, "of format 1")
	_, _, err = ParseReport(strings.NewReader(`{"kind":"header","format":1}` + "\n"))
	assert.Error(t, err, "and closes with its summary")
}

func TestAReportWithAnEvidenceErrorReads(t *testing.T) {
	report := `{"kind":"header","format":1,"run_id":"r"}` + "\n" +
		`{"kind":"pair","view":"services","outcome":"differ","category":"service_boundary","disposition":"inconclusive","errors":[{"side":"evidence","type":"internal","code":"internal"}]}` + "\n" +
		`{"kind":"summary","usable":true}` + "\n"
	_, records, err := ParseReport(strings.NewReader(report))
	require.NoError(t, err)
	require.Len(t, records, 1)
	assert.Equal(t, []ErrorRecord{{Side: "evidence", Type: "internal", Code: "internal"}}, records[0].Errors)
}

func TestTheInvestigatedWindowIsTheReportsOnceTheKeyIsChecked(t *testing.T) {
	r, key, header, _ := investigated(t)
	w, err := InvestigatedWindow(key, header, r.Tenants.Tenants[0], parity.Settled)
	require.NoError(t, err)
	assert.Equal(t, *header.Tenants[0].Settled, w)
	wrong := bytes.Clone(key)
	wrong[0] ^= 1
	_, err = InvestigatedWindow(wrong, header, r.Tenants.Tenants[0], parity.Settled)
	assert.True(t, errors.Ast(err, errors.TypeForbidden), "%v", err)
	header.Tenants[0].Recent = nil
	_, err = InvestigatedWindow(key, header, r.Tenants.Tenants[0], parity.Recent)
	assert.Error(t, err)
}

func TestAPairKeepsTheErrorsItsEvidenceMet(t *testing.T) {
	rec := PairRecord{Errors: []ErrorRecord{{Side: "engine", Type: "internal", Code: "internal"}}}
	failed := errors.Newf(errors.TypeInternal, errors.CodeInternal, "the evidence did not run")
	keepEvidenceErrors(&rec, parity.Context{EvidenceErrors: func() []error { return []error{failed, failed} }})
	assert.Equal(t, []ErrorRecord{{Side: "engine", Type: "internal", Code: "internal"}, {Side: "evidence", Type: "internal", Code: "internal"}}, rec.Errors,
		"once per kind of error, beside the sides' own")
	keepEvidenceErrors(&rec, parity.Context{})
	assert.Len(t, rec.Errors, 2, "a view without evidence adds nothing")
}

func TestAPairWhoseBoundaryEvidenceFailedIsInconclusiveWithItsError(t *testing.T) {
	fp, err := parity.NewFingerprinter(make([]byte, parity.MinRunKeyBytes))
	require.NoError(t, err)
	var errs []error
	classify := parity.Context{
		ServiceBoundary: func(string, string) parity.Boundary {
			errs = append(errs, errors.Newf(errors.TypeInternal, errors.CodeInternal, "the evidence did not run"))
			return parity.BoundaryUnavailable
		},
		EvidenceErrors: func() []error { return errs },
	}
	missing := parity.Difference{Path: parity.Path{"data", parity.Dynamic("d5r-b"), "topLevelOps", parity.Dynamic("d7-local-child")}, Kind: parity.KindRows, ClickHouse: float64(1)}
	rec := PairRecord{Outcome: "match"}
	classified(&rec, fp, []parity.Difference{missing}, classify)
	assert.Equal(t, "differ", rec.Outcome)
	assert.Equal(t, parity.CategoryServiceBoundary, rec.Category)
	assert.Equal(t, parity.Inconclusive, rec.Disposition, "an error is never a denial, so never rows")
	assert.Equal(t, []ErrorRecord{{Side: "evidence", Type: "internal", Code: "internal"}}, rec.Errors)
}
