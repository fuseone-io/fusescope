package parityrun

import (
	"context"

	"github.com/fuseone-io/fusescope/pkg/parity"
	"github.com/fuseone-io/fusescope/pkg/telemetrystore"
	"github.com/fuseone-io/fusescope/pkg/types/servicetypes/servicetypesv1"
	"github.com/fuseone-io/fusescope/pkg/valuer"
)

// subject is who the parity is to both stores.
const subject = "parity"

// plan reads one window's gate and sample data and plans its pair specs. The caller counts the specs
// it keeps as planned; plan counts the pairs the gate leaves out, which have no spec. A window whose
// data cannot be read plans nothing and makes the round unusable.
func (r Round) plan(ctx context.Context, fp *parity.Fingerprinter, report ReportWriter, t *tally, win window) ([]PairSpec, error) {
	ctx = telemetrystore.WithService(ctx, subject)
	org, class := win.tenant.Org, win.class
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
	services, err := r.serviceNames(ctx, win)
	if err != nil {
		t.addReason(ReasonDataUnavailable)
		return nil, nil
	}
	base := PairSpec{Org: org.StringValue(), Class: class}
	tenant := org.StringValue()
	var specs []PairSpec
	if gate.Tenant != nil {
		specs = append(specs, with(base, ViewServices, *gate.Tenant))
	} else {
		t.plan(tenant, ViewServices)
	}
	for _, service := range sampler.Services(tenant, services) {
		more, err := r.serviceSpecs(ctx, t, sampler, base, org, gate, service)
		if err != nil {
			t.addReason(ReasonDataUnavailable)
			return specs, nil
		}
		specs = append(specs, more...)
	}
	if gate.Tenant == nil {
		t.plan(tenant, ViewSummary, ViewWaterfall, ViewAbsentKey)
		return specs, nil
	}
	more, err := r.tenantSpecs(ctx, sampler, base, org, *gate.Tenant)
	if err != nil {
		t.addReason(ReasonDataUnavailable)
	}
	return append(specs, more...), nil
}

func with(base PairSpec, view string, w parity.Window) PairSpec {
	base.View, base.Window = view, w
	return base
}

// serviceNames are the services ClickHouse's services view lists for the window.
func (r Round) serviceNames(ctx context.Context, win window) ([]string, error) {
	items, _, err := r.ClickHouse.Services.Get(ctx, win.tenant.Org, &servicetypesv1.Request{Start: nanos(win.w.Start), End: nanos(win.w.End)})
	if err != nil {
		return nil, err
	}
	names := make([]string, 0, len(items))
	for _, item := range items {
		names = append(names, item.ServiceName)
	}
	return names, nil
}

// serviceSpecs are a sampled service's operations views and its sampled operations' views, over
// the service's clean window; a service the gate left out is planned and not compared.
func (r Round) serviceSpecs(ctx context.Context, t *tally, sampler parity.Sampler, base PairSpec, org valuer.UUID, gate parity.GateResult, service string) ([]PairSpec, error) {
	w, clean := gate.Services[service]
	if !clean {
		t.plan(base.Org, ViewTopOperations, ViewEntryOperations, ViewSpanList, ViewTimeSeries, ViewScalar)
		return nil, nil
	}
	base.Service = service
	specs := []PairSpec{with(base, ViewTopOperations, w), with(base, ViewEntryOperations, w)}
	ops, err := operations(ctx, r.ClickHouse.Querier, org, w, service)
	if err != nil {
		return nil, err
	}
	for _, op := range sampler.Operations(base.Org, service, ops) {
		base.Operation = op
		specs = append(specs, with(base, ViewSpanList, w), with(base, ViewTimeSeries, w), with(base, ViewScalar, w))
	}
	return specs, nil
}

// tenantSpecs are the trace and absent-key specs of a tenant's clean window.
func (r Round) tenantSpecs(ctx context.Context, sampler parity.Sampler, base PairSpec, org valuer.UUID, w parity.Window) ([]PairSpec, error) {
	candidates, err := traceCandidates(ctx, r.ClickHouse.Querier, org, w, r.Seed)
	if err != nil {
		return nil, err
	}
	traces, err := sampler.Traces(base.Org, candidates, r.Config.Limits)
	if err != nil {
		return nil, err
	}
	spans := map[string]int64{}
	for _, c := range candidates {
		spans[c.ID] = max(spans[c.ID], c.Spans)
	}
	var specs []PairSpec
	for _, tr := range traces {
		trace := base
		trace.TraceID, trace.Spans, trace.Reason = tr.ID, spans[tr.ID], tr.Reason
		specs = append(specs, with(trace, ViewSummary, w), with(trace, ViewWaterfall, w))
	}
	columns, err := absentColumns(ctx, r.ClickHouse.Querier, org, w)
	if err != nil {
		return specs, err
	}
	for _, c := range sampler.AbsentKeyCases(base.Org, columns) {
		absent := base
		absent.Case = &c
		specs = append(specs, with(absent, ViewAbsentKey, w))
	}
	return specs, nil
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
		switch f.Verdict.Category {
		case parity.CategoryDivergentData, parity.CategoryIngestionDuplicate:
			t.divergent[win.class]++
		case parity.CategoryDualWriteUnhealthy:
			t.addReason(ReasonDualWriteUnhealthy)
		}
		if f.Verdict.Disposition == parity.Blocking {
			t.addReason(ReasonSettledDivergence)
		}
	}
	return nil
}
