package parityrun

import (
	"encoding/json"
	"os"
	"path/filepath"
	"time"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/parity"
)

var ErrCodeReport = errors.MustNewCode("parity_report")

// ReportFormat is the version of the report's lines.
const ReportFormat = 1

// The report is written from these types alone: no error, request, answer or statement is ever
// serialized into it, and every value naming tenant data is a fingerprint.

// Header opens a round's report.
type Header struct {
	Kind          string              `json:"kind"`
	Format        int                 `json:"format"`
	RunID         string              `json:"run_id"`
	RunKeyID      string              `json:"run_key_id"`
	RunKeyCheck   string              `json:"run_key_check"`
	BackendCommit string              `json:"backend_commit"`
	ImageDigest   string              `json:"image_digest"`
	EngineVersion string              `json:"engine_version"`
	Seed          uint64              `json:"seed"`
	Sample        parity.SampleConfig `json:"sample"`
	Tenants       []TenantHeader      `json:"tenants"`
}

// TenantHeader is a tenant by fingerprint, with its windows of the round.
type TenantHeader struct {
	Tenant  string         `json:"tenant"`
	Settled *parity.Window `json:"settled,omitempty"`
	Recent  *parity.Window `json:"recent,omitempty"`
}

// PairRecord is one pair: what it compared, by fingerprint, and what came of it.
type PairRecord struct {
	Kind         string             `json:"kind"`
	View         string             `json:"view"`
	Tenant       string             `json:"tenant"`
	Params       string             `json:"params"`
	WindowClass  parity.WindowClass `json:"window_class"`
	Requeued     bool               `json:"requeued,omitempty"`
	EngineFirst  bool               `json:"engine_first"`
	Attempts     int                `json:"attempts"`
	Outcome      string             `json:"outcome"`
	Category     parity.Category    `json:"category,omitempty"`
	Disposition  parity.Disposition `json:"disposition,omitempty"`
	BothFailed   string             `json:"both_failed,omitempty"`
	Errors       []ErrorRecord      `json:"errors,omitempty"`
	Differences  []DifferenceRecord `json:"differences,omitempty"`
	EngineMs     float64            `json:"engine_ms"`
	ClickHouseMs float64            `json:"clickhouse_ms"`
}

// DifferenceRecord is one difference: its path, dynamic segments by fingerprint, and its verdict.
type DifferenceRecord struct {
	Path        string             `json:"path"`
	Kind        parity.Kind        `json:"kind"`
	Category    parity.Category    `json:"category"`
	Disposition parity.Disposition `json:"disposition"`
}

// GateRecord is a minute the count gate left out, its service by fingerprint.
type GateRecord struct {
	Kind        string             `json:"kind"`
	Tenant      string             `json:"tenant"`
	Service     string             `json:"service,omitempty"`
	WindowClass parity.WindowClass `json:"window_class"`
	Minute      int64              `json:"minute"`
	Reason      string             `json:"reason,omitempty"`
	Category    parity.Category    `json:"category"`
	Disposition parity.Disposition `json:"disposition"`
}

// ErrorRecord is a failed side by the type and code of its error; the message, which may carry a
// statement or a tenant value, is never kept.
type ErrorRecord struct {
	Side string `json:"side"`
	Type string `json:"type"`
	Code string `json:"code"`
}

// Summary closes a round's report; only a report with one is published.
type Summary struct {
	Kind     string         `json:"kind"`
	Counts   []CountRecord  `json:"counts"`
	Coverage []CoverageView `json:"coverage"`
	// Usable says the round ran as planned; Qualifying, that it also met every round criterion.
	Usable     bool `json:"usable"`
	Qualifying bool `json:"qualifying"`
	// Reasons are fixed codes for a round that is not usable or does not qualify.
	Reasons []string `json:"reasons,omitempty"`
}

// CountRecord is how many pairs of a view had an outcome, category and disposition.
type CountRecord struct {
	View        string             `json:"view"`
	Outcome     string             `json:"outcome"`
	Category    parity.Category    `json:"category,omitempty"`
	Disposition parity.Disposition `json:"disposition,omitempty"`
	Pairs       int                `json:"pairs"`
}

// CoverageView is a view's planned, reached and successful pairs, and the p95 latency of each side
// over the successful ones: both sides answered whole.
type CoverageView struct {
	View            string  `json:"view"`
	Planned         int     `json:"planned"`
	Reached         int     `json:"reached"`
	Successful      int     `json:"successful"`
	EngineP95Ms     float64 `json:"engine_p95_ms"`
	ClickHouseP95Ms float64 `json:"clickhouse_p95_ms"`
}

// ErrorOf is err as a report keeps it, nil when there is none.
func ErrorOf(side string, err error) *ErrorRecord {
	if err == nil {
		return nil
	}
	t, code, _, _, _, _ := errors.Unwrapb(err)
	return &ErrorRecord{Side: side, Type: t.String(), Code: code.String()}
}

// ReportWriter writes one round's report and publishes it whole, or not at all.
type ReportWriter interface {
	// Write appends a Header, PairRecord or GateRecord.
	Write(line any) error
	// Publish appends the summary and makes the report visible; it never replaces another.
	Publish(Summary) error
	// Abort discards an unpublished report.
	Abort() error
}

// ReportSink creates a round's report.
type ReportSink interface {
	Create(runID string) (ReportWriter, error)
}

// FileSink writes reports into Dir: a temporary file readable by its owner only, synced and linked
// to <run id>.jsonl when the summary is written.
type FileSink struct {
	Dir string
}

// Create starts the report of runID.
//
// # Errors
//
// A temporary file that cannot be created.
func (s FileSink) Create(runID string) (ReportWriter, error) {
	f, err := os.CreateTemp(s.Dir, "."+runID+"-*.tmp")
	if err != nil {
		return nil, errors.WrapInternalf(err, ErrCodeReport, "error creating the report")
	}
	if err := f.Chmod(0o600); err != nil {
		_ = f.Close()
		_ = os.Remove(f.Name())
		return nil, errors.WrapInternalf(err, ErrCodeReport, "error restricting the report")
	}
	return &fileWriter{f: f, final: filepath.Join(s.Dir, runID+".jsonl"), enc: json.NewEncoder(f)}, nil
}

type fileWriter struct {
	f     *os.File
	final string
	enc   *json.Encoder
	done  bool
}

func (w *fileWriter) Write(line any) error {
	if w.done {
		return errors.Newf(errors.TypeInternal, ErrCodeReport, "the report is closed")
	}
	switch l := line.(type) {
	case Header:
		l.Kind, l.Format = "header", ReportFormat
		line = l
	case PairRecord:
		l.Kind = "pair"
		line = l
	case GateRecord:
		l.Kind = "gate"
		line = l
	default:
		return errors.Newf(errors.TypeInternal, ErrCodeReport, "a report holds headers, pairs and gate minutes only")
	}
	if err := w.enc.Encode(line); err != nil {
		return errors.WrapInternalf(err, ErrCodeReport, "error writing the report")
	}
	return nil
}

func (w *fileWriter) Publish(summary Summary) error {
	if w.done {
		return errors.Newf(errors.TypeInternal, ErrCodeReport, "the report is closed")
	}
	w.done = true
	summary.Kind = "summary"
	err := w.enc.Encode(summary)
	if err == nil {
		err = w.f.Sync()
	}
	if closeErr := w.f.Close(); err == nil {
		err = closeErr
	}
	if err == nil {
		err = os.Link(w.f.Name(), w.final)
	}
	_ = os.Remove(w.f.Name())
	if err != nil {
		return errors.WrapInternalf(err, ErrCodeReport, "error publishing the report")
	}
	return syncDir(filepath.Dir(w.final))
}

func (w *fileWriter) Abort() error {
	if w.done {
		return nil
	}
	w.done = true
	_ = w.f.Close()
	return os.Remove(w.f.Name())
}

func syncDir(dir string) error {
	d, err := os.Open(dir)
	if err != nil {
		return errors.WrapInternalf(err, ErrCodeReport, "error opening the report directory")
	}
	defer d.Close()
	if err := d.Sync(); err != nil {
		return errors.WrapInternalf(err, ErrCodeReport, "error syncing the report directory")
	}
	return nil
}

// durationMs is d in milliseconds, as the report keeps latencies.
func durationMs(d time.Duration) float64 { return float64(d.Microseconds()) / 1000 }
