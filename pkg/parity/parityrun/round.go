package parityrun

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"strconv"
	"time"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/parity"
	"github.com/fuseone-io/fusescope/pkg/parity/parityexec"
	"github.com/fuseone-io/fusescope/pkg/telemetrystore"
	qbtypes "github.com/fuseone-io/fusescope/pkg/types/querybuildertypes/querybuildertypesv5"
	"github.com/fuseone-io/fusescope/pkg/types/telemetrytypes"
)

var ErrCodeRound = errors.MustNewCode("parity_round")

// The reasons a round does not qualify, as the summary lists them.
const (
	ReasonHealthUnavailable   = "health_unavailable"
	ReasonDataUnavailable     = "data_unavailable"
	ReasonBlockingDifference  = "blocking_difference"
	ReasonSettledDivergence   = "settled_divergence"
	ReasonBudgetExhausted     = "budget_exhausted"
	ReasonMetricsPushFailed   = "metrics_push_failed"
	ReasonRequeueUnavailable  = "requeue_unavailable"
	ReasonRequeueFailed       = "requeue_failed"
	ReasonRequeueInvalid      = "requeue_invalid"
	ReasonDualWriteUnhealthy  = "dual_write_unhealthy"
	ReasonInconclusive        = "inconclusive_over_limit"
	ReasonCoverage            = "coverage_below_limit"
	ReasonTenantViewUncovered = "tenant_view_uncovered"
	ReasonLatency             = "latency_over_limit"
	ReasonNothingCompared     = "nothing_compared"
)

// errBudget is the cause of a round's budget running out, told apart from a cancelled round.
var errBudget = errors.Newf(errors.TypeTimeout, ErrCodeRound, "the round's budget ran out")

// BuildInfo names what ran the round, for the report's header.
type BuildInfo struct {
	BackendCommit string
	ImageDigest   string
	EngineVersion string
}

// Config bounds a round.
type Config struct {
	Window parity.WindowConfig
	Sample parity.SampleConfig
	// Limits are the engine's query.max_rows and the span count above which the waterfall is
	// windowed, as the deployment configures them.
	Limits          parity.TraceLimits
	OperationsLimit int
	ListLimit       int
	Deadline        time.Duration
	RetryWait       time.Duration
	Concurrency     int
	MaxPairs        int
	Budget          time.Duration
	// PushTimeout bounds the metrics push and the requeue, which run after the budget.
	PushTimeout time.Duration
	Build       BuildInfo
}

// DefaultConfig is the design's: 2 pairs at once, 30 s a call, and the engine's and the trace
// detail's own default limits.
func DefaultConfig() Config {
	return Config{
		Window: parity.DefaultWindowConfig(), Sample: parity.DefaultSampleConfig(),
		Limits:          parity.TraceLimits{MaxRows: 1_000_000, WindowedAbove: 10_000},
		OperationsLimit: 10, ListLimit: 100,
		Deadline: 30 * time.Second, RetryWait: 5 * time.Second,
		Concurrency: 2, MaxPairs: 5_000, Budget: 50 * time.Minute, PushTimeout: 30 * time.Second,
	}
}

// Round is one parity round over the tenants file, its dependencies injected.
type Round struct {
	Engine     *parityexec.Graph
	ClickHouse *parityexec.Graph
	Refuser    *parityexec.Refuser
	// Keys resolves field keys as ClickHouse's metadata does, for the evidence queries.
	Keys     telemetrytypes.KeyResolver
	Tenants  Tenants
	KeyStore KeyStore
	Reports  ReportSink
	Health   HealthSource
	Metrics  MetricsPusher
	Requeue  RequeueStore
	Config   Config
	Seed     parity.Seed
	Now      func() time.Time
}

// RunID is a round's id: its start, to the second, and its seed, as a Secret name may hold them.
func RunID(start time.Time, seed parity.Seed) string {
	return start.UTC().Format("20060102t150405z") + "-" + strconv.FormatUint(uint64(seed), 10)
}

// Run runs the round and publishes its report. The run key is stored before anything is read, and
// the budget bounds every read from then on. A cancelled round publishes nothing.
//
// # Errors
//
// A missing dependency, a run key that cannot be made or stored, a report that cannot be written, a
// cancelled round, or metrics that cannot be pushed; the report is still published, marked, then.
func (r Round) Run(ctx context.Context) (Summary, error) {
	if r.Engine == nil || r.ClickHouse == nil || r.Refuser == nil || r.Keys == nil || r.KeyStore == nil || r.Reports == nil || r.Metrics == nil || r.Requeue == nil || r.Now == nil {
		return Summary{}, errors.Newf(errors.TypeInvalidInput, ErrCodeRound, "a round needs both graphs, the refuser, the keys, the key store, the reports, the metrics, the requeue and a clock")
	}
	start := r.Now()
	runID := RunID(start, r.Seed)
	key := make([]byte, parity.MinRunKeyBytes)
	if _, err := rand.Read(key); err != nil {
		return Summary{}, errors.WrapInternalf(err, ErrCodeRound, "error making the run key")
	}
	keyID := "parity-run-" + runID
	if err := r.KeyStore.Store(ctx, keyID, key); err != nil {
		return Summary{}, err
	}
	fp, err := parity.NewFingerprinter(key)
	if err != nil {
		return Summary{}, err
	}
	report, err := r.Reports.Create(runID)
	if err != nil {
		return Summary{}, err
	}
	budget, cancel := context.WithTimeoutCause(ctx, r.Config.Budget, errBudget)
	out, err := r.run(budget, start, runID, keyID, RunKeyCheck(key, runID), fp, report)
	cancel()
	if err == nil && ctx.Err() != nil {
		err = ctx.Err()
	}
	if err != nil {
		_ = report.Abort()
		return Summary{}, err
	}
	t := out.tally
	if errors.Is(context.Cause(budget), errBudget) {
		t.addReason(ReasonBudgetExhausted)
	}
	if out.loaded {
		requeueCtx, done := context.WithTimeout(ctx, r.Config.PushTimeout)
		if err := r.Requeue.Replace(requeueCtx, out.version, out.queue); err != nil {
			t.addReason(ReasonRequeueFailed)
		}
		done()
	}
	metrics := NewMetrics()
	t.finish(metrics)
	pushCtx, done := context.WithTimeout(ctx, r.Config.PushTimeout)
	pushErr := r.Metrics.Push(pushCtx, metrics.Registry())
	done()
	if pushErr != nil {
		t.addReason(ReasonMetricsPushFailed)
		t.settle()
	}
	if err := ctx.Err(); err != nil {
		_ = report.Abort()
		return Summary{}, err
	}
	if err := report.Publish(t.Summary); err != nil {
		return t.Summary, err
	}
	return t.Summary, pushErr
}

// window is a tenant's window of one class, as planned.
type window struct {
	tenant Tenant
	class  parity.WindowClass
	w      parity.Window
}

// outcome is what the round's core leaves for its end: the tally and the queue to replace the
// loaded one with, if it was loaded.
type outcome struct {
	tally   *tally
	loaded  bool
	version string
	queue   []PairSpec
}

func (r Round) run(ctx context.Context, start time.Time, runID, keyID, keyCheck string, fp *parity.Fingerprinter, report ReportWriter) (outcome, error) {
	windows, header, err := r.windows(start, fp)
	if err != nil {
		return outcome{}, err
	}
	header.RunID, header.RunKeyID, header.RunKeyCheck = runID, keyID, keyCheck
	if err := report.Write(header); err != nil {
		return outcome{}, err
	}
	out := outcome{tally: newTally()}
	t := out.tally
	pairs, carried := r.requeued(ctx, start, t, &out)
	seen := map[string]bool{}
	for _, p := range pairs {
		seen[specKey(p.spec)] = true
	}
	for _, win := range windows {
		if ctx.Err() != nil {
			break
		}
		specs, err := r.plan(ctx, fp, report, t, win)
		if err != nil {
			return outcome{}, err
		}
		for _, spec := range specs {
			if seen[specKey(spec)] {
				continue
			}
			seen[specKey(spec)] = true
			t.plan(spec.Org, spec.View)
			p, err := r.build(r.evidencer(), spec)
			if err != nil {
				return outcome{}, err
			}
			pairs = append(pairs, p)
		}
	}
	queue := carried
	if len(pairs) > r.Config.MaxPairs {
		for _, p := range pairs[r.Config.MaxPairs:] {
			if p.requeued {
				queue = append(queue, p.spec)
			}
		}
		pairs = pairs[:r.Config.MaxPairs]
		t.addReason(ReasonBudgetExhausted)
	}
	results := r.execute(ctx, fp, pairs)
	for i, p := range pairs {
		d := results[i]
		switch {
		case d == nil && p.requeued:
			queue = append(queue, p.spec)
			continue
		case d == nil:
			continue
		}
		t.add(p.spec.Org, d.record)
		if d.requeue {
			queue = append(queue, p.spec)
		}
		if err := report.Write(d.record); err != nil {
			return outcome{}, err
		}
	}
	out.queue = queue
	return out, nil
}

func (r Round) evidencer() parityexec.Evidencer {
	return parityexec.Evidencer{Querier: r.ClickHouse.Querier, Keys: r.Keys}
}

// specKey names a spec whatever its span count, which is read again, and why its trace was
// sampled, which changes no query.
func specKey(spec PairSpec) string {
	spec.Spans, spec.Reason = 0, ""
	raw, _ := json.Marshal(spec)
	return string(raw)
}

func uniqueSpecs(specs []PairSpec) []PairSpec {
	seen := map[string]bool{}
	out := make([]PairSpec, 0, len(specs))
	for _, spec := range specs {
		if k := specKey(spec); !seen[k] {
			seen[k] = true
			out = append(out, spec)
		}
	}
	return out
}

// requeued loads the queue and builds the pairs it can run now: specs of tenants of the file,
// within retention, whose window passes its gate again. Trace specs have their span count read
// again. Specs the gate does not pass now are carried to the next round; the others leave the queue
// once they ran.
func (r Round) requeued(ctx context.Context, now time.Time, t *tally, out *outcome) ([]pair, []PairSpec) {
	specs, version, err := r.Requeue.Load(ctx)
	if err != nil {
		t.addReason(ReasonRequeueUnavailable)
		return nil, nil
	}
	out.loaded, out.version = true, version
	var pairs []pair
	var carried []PairSpec
	for _, spec := range uniqueSpecs(specs) {
		tenant, ok := r.Tenants.tenant(spec.Org)
		if !ok || r.validSpec(spec, tenant) != nil {
			t.addReason(ReasonRequeueInvalid)
			continue
		}
		if _, err := r.build(r.evidencer(), spec); err != nil {
			t.addReason(ReasonRequeueInvalid)
			continue
		}
		if spec.Window.Start < now.Add(-min(tenant.Retention.ClickHouse, tenant.Retention.Engine)).UnixNano() {
			continue
		}
		clean, err := r.specClean(ctx, tenant, spec)
		if err != nil || !clean {
			carried = append(carried, spec)
			continue
		}
		if spec, err = r.refreshSpans(ctx, tenant, spec); err != nil {
			carried = append(carried, spec)
			continue
		}
		p, err := r.build(r.evidencer(), spec)
		if err != nil {
			t.addReason(ReasonRequeueInvalid)
			continue
		}
		p.requeued = true
		t.plan(spec.Org, spec.View)
		pairs = append(pairs, p)
	}
	return pairs, carried
}

// specClean tells whether a spec's whole window passes its gate now, for its service when it has
// one and for the tenant otherwise.
func (r Round) specClean(ctx context.Context, tenant Tenant, spec PairSpec) (bool, error) {
	ctx = telemetrystore.WithService(ctx, subject)
	unhealthy, err := unhealthyMinutes(ctx, r.Health, r.Tenants, spec.Org, spec.Window, int64(r.Config.Window.Step))
	if err != nil {
		return false, err
	}
	clickhouse, err := serviceCounts(ctx, r.ClickHouse.Querier, tenant.Org, spec.Window)
	if err != nil {
		return false, err
	}
	engine, err := serviceCounts(ctx, r.Engine.Querier, tenant.Org, spec.Window)
	if err != nil {
		return false, err
	}
	gate, err := parity.Gate(r.Config.Window, parity.GateInput{Class: spec.Class, Window: spec.Window, Engine: engine, ClickHouse: clickhouse, Unhealthy: unhealthy})
	if err != nil {
		return false, err
	}
	switch spec.View {
	case ViewServices, ViewSummary, ViewWaterfall, ViewAbsentKey:
		return gate.Tenant != nil && *gate.Tenant == spec.Window, nil
	}
	w, ok := gate.Services[spec.Service]
	return ok && w == spec.Window, nil
}

// refreshSpans reads a trace spec's span count again, since late data may have changed it.
func (r Round) refreshSpans(ctx context.Context, tenant Tenant, spec PairSpec) (PairSpec, error) {
	if spec.TraceID == "" {
		return spec, nil
	}
	got, err := candidateQuery(telemetrystore.WithService(ctx, subject), r.ClickHouse.Querier, tenant.Org, spec.Window, "trace_id IN ('"+spec.TraceID+"')", "spans", qbtypes.OrderDirectionDesc, 1)
	if err != nil {
		return spec, err
	}
	spec.Spans = 0
	for _, c := range got {
		spec.Spans = max(spec.Spans, c.Spans)
	}
	return spec, nil
}

// windows are the round's windows of every tenant, and the header that names them.
func (r Round) windows(start time.Time, fp *parity.Fingerprinter) ([]window, Header, error) {
	header := Header{Seed: uint64(r.Seed), Sample: r.Config.Sample,
		BackendCommit: r.Config.Build.BackendCommit, ImageDigest: r.Config.Build.ImageDigest, EngineVersion: r.Config.Build.EngineVersion}
	var windows []window
	for _, tenant := range r.Tenants.Tenants {
		th := TenantHeader{Tenant: fp.Segment(tenant.Org.StringValue())}
		for _, class := range []parity.WindowClass{parity.Settled, parity.Recent} {
			w, ok, err := parity.PlanWindow(r.Config.Window, class, start, tenant.DualWriteEpoch, tenant.Retention)
			if err != nil {
				return nil, Header{}, err
			}
			if !ok {
				continue
			}
			if class == parity.Settled {
				th.Settled = &w
			} else {
				th.Recent = &w
			}
			windows = append(windows, window{tenant: tenant, class: class, w: w})
		}
		header.Tenants = append(header.Tenants, th)
	}
	return windows, header, nil
}
