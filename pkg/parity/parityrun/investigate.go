package parityrun

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"slices"
	"strings"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/parity"
	"github.com/fuseone-io/fusescope/pkg/parity/parityexec"
	"github.com/fuseone-io/fusescope/pkg/telemetrystore"
)

var ErrCodeInvestigation = errors.MustNewCode("parity_investigation")

// maxReportLine caps one line of a report read back.
const maxReportLine = 16 << 20

// Investigation is what an operator looks at: one tenant's window of one class in a round's report.
type Investigation struct {
	Header  Header
	Records []PairRecord
	Tenant  Tenant
	Class   parity.WindowClass
}

// ParseReport reads a published report back: its header, of format 1, its pairs, and its summary,
// which a published report always ends with.
//
// # Errors
//
// A report that does not open with a header of format 1, holds an unknown line, or has no summary.
func ParseReport(r io.Reader) (Header, []PairRecord, error) {
	invalid := errors.Newf(errors.TypeInvalidInput, ErrCodeInvestigation, "the report is not a whole report of format %d", ReportFormat)
	scanner := bufio.NewScanner(r)
	scanner.Buffer(make([]byte, 0, 64<<10), maxReportLine)
	var header Header
	var pairs []PairRecord
	first, summarized := true, false
	for scanner.Scan() {
		var kind struct {
			Kind string `json:"kind"`
		}
		if err := json.Unmarshal(scanner.Bytes(), &kind); err != nil || summarized {
			return Header{}, nil, invalid
		}
		switch {
		case first && kind.Kind == "header":
			if err := json.Unmarshal(scanner.Bytes(), &header); err != nil || header.Format != ReportFormat {
				return Header{}, nil, invalid
			}
		case !first && kind.Kind == "pair":
			var p PairRecord
			if err := json.Unmarshal(scanner.Bytes(), &p); err != nil {
				return Header{}, nil, invalid
			}
			pairs = append(pairs, p)
		case !first && kind.Kind == "gate":
		case !first && kind.Kind == "summary":
			summarized = true
		default:
			return Header{}, nil, invalid
		}
		first = false
	}
	if scanner.Err() != nil || !summarized {
		return Header{}, nil, invalid
	}
	return header, pairs, nil
}

// Investigate shows, on out, the values behind the differences the report recorded for inv's
// tenant and window: it plans that window again with the report's seed and sample, finds each
// recorded pair by its parameters' fingerprint, runs it again and prints the differences whose
// path the report holds, dynamic segments and values in the clear. A recorded pair that does not
// come back is flagged: the data or the plan changed since. The key is checked against the
// report's run key check before anything is read.
//
// # Errors
//
// A key that is not the report's, a window the report does not hold, or a plan that fails.
func (r Round) Investigate(ctx context.Context, key []byte, inv Investigation, out io.Writer) (int, error) {
	if !VerifyRunKey(key, inv.Header.RunID, inv.Header.RunKeyCheck) {
		return 0, errors.Newf(errors.TypeForbidden, ErrCodeInvestigation, "the key is not this round's")
	}
	fp, err := parity.NewFingerprinter(key)
	if err != nil {
		return 0, err
	}
	org := inv.Tenant.Org.StringValue()
	w, err := investigatedWindow(inv, fp.Segment(org))
	if err != nil {
		return 0, err
	}
	r.Seed, r.Config.Sample = parity.Seed(inv.Header.Seed), inv.Header.Sample
	specs, err := r.plan(ctx, fp, discardReport{}, newTally(), window{tenant: inv.Tenant, class: inv.Class, w: w})
	if err != nil {
		return 0, err
	}
	wanted := map[string]PairRecord{}
	for _, rec := range inv.Records {
		if rec.Tenant == fp.Segment(org) && rec.WindowClass == inv.Class && (rec.Outcome == "differ" || rec.Outcome == "verdict") {
			wanted[rec.Params] = rec
		}
	}
	shown := 0
	for i, spec := range specs {
		rec, ok := wanted[fp.Value(spec).MAC]
		if !ok {
			continue
		}
		delete(wanted, fp.Value(spec).MAC)
		n, err := r.reinvestigate(ctx, fp, i, spec, rec, out)
		if err != nil {
			return shown, err
		}
		shown += n
	}
	if len(wanted) > 0 {
		fmt.Fprintf(out, "%d pairs of the report not reproduced: the data or the plan changed since the round\n", len(wanted))
	}
	return shown, nil
}

// InvestigatedWindow is the window of tenant and class the report of header holds, once key is
// checked against the report: nothing is queried, so it can name the window in the audit event
// that opens the session.
//
// # Errors
//
// A key that is not the report's, or a window the report does not hold.
func InvestigatedWindow(key []byte, header Header, tenant Tenant, class parity.WindowClass) (parity.Window, error) {
	if !VerifyRunKey(key, header.RunID, header.RunKeyCheck) {
		return parity.Window{}, errors.Newf(errors.TypeForbidden, ErrCodeInvestigation, "the key is not this round's")
	}
	fp, err := parity.NewFingerprinter(key)
	if err != nil {
		return parity.Window{}, err
	}
	return investigatedWindow(Investigation{Header: header, Class: class}, fp.Segment(tenant.Org.StringValue()))
}

func investigatedWindow(inv Investigation, tenant string) (parity.Window, error) {
	i := slices.IndexFunc(inv.Header.Tenants, func(t TenantHeader) bool { return t.Tenant == tenant })
	if i >= 0 {
		th := inv.Header.Tenants[i]
		if inv.Class == parity.Settled && th.Settled != nil {
			return *th.Settled, nil
		}
		if inv.Class == parity.Recent && th.Recent != nil {
			return *th.Recent, nil
		}
	}
	return parity.Window{}, errors.Newf(errors.TypeNotFound, ErrCodeInvestigation, "the report holds no such window for the tenant")
}

// reinvestigate runs one recorded pair again and prints what the report recorded of it.
func (r Round) reinvestigate(ctx context.Context, fp *parity.Fingerprinter, index int, spec PairSpec, rec PairRecord, out io.Writer) (int, error) {
	p, err := r.build(r.evidencer(), spec)
	if err != nil {
		return 0, err
	}
	raw, _ := json.Marshal(spec)
	fmt.Fprintf(out, "%s %s\n  recorded: %s %s %s\n", spec.View, raw, rec.Outcome, rec.Category, rec.Disposition)
	runner := parityexec.Runner{Engine: r.Engine, ClickHouse: r.ClickHouse, Refuser: r.Refuser, Seed: r.Seed, Deadline: r.Config.Deadline, RetryWait: r.Config.RetryWait}
	result := runner.Run(ctx, parityexec.Pair{Index: index, Call: p.call, Limit: p.limit})
	if rec.Outcome == "verdict" || !result.Outcome.Compare {
		fmt.Fprintf(out, "  now: %s\n", describeOutcome(result.Outcome))
		return 0, nil
	}
	view, classify := p.judge(telemetrystore.WithService(ctx, subject), result.Engine.Answer, result.ClickHouse.Answer)
	engine, rule := view.Normalize(result.Engine.Answer)
	clickhouse, _ := view.Normalize(result.ClickHouse.Answer)
	shown := 0
	found := map[string]bool{}
	for _, d := range parity.Compare(engine, clickhouse, rule) {
		path := fp.Path(d.Path...)
		if !slices.ContainsFunc(rec.Differences, func(rd DifferenceRecord) bool { return rd.Path == path }) {
			continue
		}
		found[path] = true
		v := parity.Classify(d, classify)
		e, _ := json.Marshal(d.Engine)
		c, _ := json.Marshal(d.ClickHouse)
		fmt.Fprintf(out, "  %s (%s, %s %s)\n    engine: %s\n    clickhouse: %s\n", plainPath(d.Path), d.Kind, v.Category, v.Disposition, e, c)
		shown++
	}
	if missing := len(rec.Differences) - len(found); missing > 0 {
		fmt.Fprintf(out, "  %d recorded differences not found now: the data or the comparison changed since the round\n", missing)
	}
	return shown, nil
}

func describeOutcome(o parityexec.Outcome) string {
	switch {
	case o.Compare:
		return "both answered"
	case o.BothFailed != "":
		return "both failed: " + o.BothFailed
	case o.Verdict != nil:
		return string(o.Verdict.Category) + " " + string(o.Verdict.Disposition)
	}
	return "cancelled"
}

// plainPath is a path with its dynamic segments in the clear, for the terminal only.
func plainPath(path parity.Path) string {
	var b strings.Builder
	for _, segment := range path {
		switch s := segment.(type) {
		case parity.Dynamic:
			b.WriteString("[" + string(s) + "]")
		case int:
			fmt.Fprintf(&b, "[%d]", s)
		default:
			if b.Len() > 0 {
				b.WriteByte('.')
			}
			fmt.Fprint(&b, s)
		}
	}
	return b.String()
}

// discardReport is the report of a plan made again: nothing of it is kept.
type discardReport struct{}

func (discardReport) Write(any) error                        { return nil }
func (discardReport) Publish(context.Context, Summary) error { return nil }
func (discardReport) Abort() error                           { return nil }
