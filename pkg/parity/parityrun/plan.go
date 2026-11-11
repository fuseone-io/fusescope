package parityrun

import (
	"context"
	"slices"

	"github.com/fuseone-io/fusescope/pkg/parity"
	"github.com/fuseone-io/fusescope/pkg/parity/parityexec"
	"github.com/fuseone-io/fusescope/pkg/telemetrystore"
)

// subject is who the parity is to both stores.
const subject = "parity"

// servicePairViews are the views planned for each sampled service, whether or not the gate keeps it.
var servicePairViews = []string{"top_operations", "entry_operations", "span_list", "time_series", "scalar"}

// plan reads one window's gate and sample data and plans its pairs. A window whose data cannot be
// read plans nothing and keeps the round from qualifying.
func (r Round) plan(ctx context.Context, ev parityexec.Evidencer, fp *parity.Fingerprinter, report ReportWriter, t *tally, win window) ([]pair, error) {
	ctx = telemetrystore.WithService(ctx, subject)
	org, class := win.tenant.Org, win.class
	ev.Org = org
	unhealthy, err := unhealthyMinutes(ctx, r.Health, r.Tenants, org.StringValue(), win.w, int64(r.Config.Window.Step))
	if err != nil {
		t.addReason(ReasonHealthUnavailable)
	}
	clickhouse, chErr := serviceCounts(ctx, r.ClickHouse.Querier, org, win.w)
	engine, engineErr := serviceCounts(ctx, r.Engine.Querier, org, win.w)
	if chErr != nil || engineErr != nil {
		t.addReason(ReasonDataUnavailable)
		return nil, nil
	}
	gate, err := parity.Gate(r.Config.Window, parity.GateInput{Class: class, Window: win.w, Engine: engine, ClickHouse: clickhouse, Unhealthy: unhealthy})
	if err != nil {
		return nil, err
	}
	if err := r.gateRecords(fp, report, t, win, gate); err != nil {
		return nil, err
	}
	sampler, err := parity.NewSampler(r.Seed, win.w, r.Config.Sample)
	if err != nil {
		return nil, err
	}
	services := sampler.Services(org.StringValue(), slices.Collect(mapKeys(clickhouse)))
	if gate.Tenant == nil {
		t.plan("services", "summary", "waterfall")
		for range services {
			t.plan(servicePairViews...)
		}
		return nil, nil
	}
	pairs := []pair{servicesPair(ev, org, class, *gate.Tenant)}
	t.plan("services")
	for _, service := range services {
		t.plan(servicePairViews...)
		w, ok := gate.Services[service]
		if !ok {
			continue
		}
		pairs = append(pairs, operationsPair(ev, org, class, w, service, r.Config.OperationsLimit, false), operationsPair(ev, org, class, w, service, r.Config.OperationsLimit, true))
		pairs = append(pairs, servicePairs(ev, org, class, w, service, r.Config.ListLimit)...)
	}
	more, err := r.tenantPairs(ctx, ev, t, sampler, win, *gate.Tenant)
	if err != nil {
		return nil, err
	}
	return append(pairs, more...), nil
}

// tenantPairs are the trace and absent-key pairs of a tenant's clean window.
func (r Round) tenantPairs(ctx context.Context, ev parityexec.Evidencer, t *tally, sampler parity.Sampler, win window, w parity.Window) ([]pair, error) {
	org := win.tenant.Org
	candidates, err := traceCandidates(ctx, r.ClickHouse.Querier, org, w)
	if err != nil {
		t.addReason(ReasonDataUnavailable)
		return nil, nil
	}
	traces, err := sampler.Traces(org.StringValue(), candidates, r.Config.Limits)
	if err != nil {
		return nil, err
	}
	spans := map[string]int64{}
	for _, c := range candidates {
		spans[c.ID] = c.Spans
	}
	pairs := tracePairs(org, win.class, traces, spans, r.Config.Limits.MaxRows)
	for range traces {
		t.plan("summary", "waterfall")
	}
	columns, err := absentColumns(ctx, r.ClickHouse.Querier, org, w)
	if err != nil {
		t.addReason(ReasonDataUnavailable)
		return pairs, nil
	}
	cases := sampler.AbsentKeyCases(org.StringValue(), columns)
	for range cases {
		t.plan("absent_key")
	}
	return append(pairs, absentKeyPairs(ev, org, win.class, w, cases, r.Config.ListLimit)...), nil
}

func (r Round) gateRecords(fp *parity.Fingerprinter, report ReportWriter, t *tally, win window, gate parity.GateResult) error {
	for _, f := range gate.Findings {
		rec := GateRecord{Tenant: fp.Segment(win.tenant.Org.StringValue()), WindowClass: win.class, Minute: f.Minute,
			Reason: string(f.Reason), Category: f.Verdict.Category, Disposition: f.Verdict.Disposition}
		if f.Service != "" {
			rec.Service = fp.Segment(f.Service)
		}
		if err := report.Write(rec); err != nil {
			return err
		}
		if f.Verdict.Category == parity.CategoryDivergentData || f.Verdict.Category == parity.CategoryIngestionDuplicate {
			t.divergent[win.class]++
		}
		if f.Verdict.Disposition == parity.Blocking {
			t.addReason(ReasonSettledDivergence)
		}
	}
	return nil
}

func mapKeys[V any](m map[string]V) func(func(string) bool) {
	return func(yield func(string) bool) {
		for k := range m {
			if !yield(k) {
				return
			}
		}
	}
}
