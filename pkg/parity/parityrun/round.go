package parityrun

import (
	"context"
	"crypto/rand"
	"strconv"
	"time"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/parity"
	"github.com/fuseone-io/fusescope/pkg/parity/parityexec"
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
	t, requeue, err := r.run(budget, start, runID, keyID, fp, report)
	cancel()
	if err == nil && ctx.Err() != nil {
		err = ctx.Err()
	}
	if err != nil {
		_ = report.Abort()
		return Summary{}, err
	}
	if errors.Is(context.Cause(budget), errBudget) {
		t.addReason(ReasonBudgetExhausted)
	}
	after, done := context.WithTimeout(context.WithoutCancel(ctx), r.Config.PushTimeout)
	defer done()
	if len(requeue) > 0 {
		if err := r.Requeue.Put(after, requeue); err != nil {
			t.addReason(ReasonRequeueFailed)
		}
	}
	metrics := NewMetrics()
	t.finish(metrics)
	pushErr := r.Metrics.Push(after, metrics.Registry())
	if pushErr != nil {
		t.addReason(ReasonMetricsPushFailed)
		t.settle()
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

func (r Round) run(ctx context.Context, start time.Time, runID, keyID string, fp *parity.Fingerprinter, report ReportWriter) (*tally, []PairSpec, error) {
	windows, header, err := r.windows(start, fp)
	if err != nil {
		return nil, nil, err
	}
	header.RunID, header.RunKeyID = runID, keyID
	if err := report.Write(header); err != nil {
		return nil, nil, err
	}
	t := newTally()
	pairs := r.requeued(ctx, t)
	for _, win := range windows {
		if ctx.Err() != nil {
			break
		}
		specs, err := r.plan(ctx, fp, report, t, win)
		if err != nil {
			return nil, nil, err
		}
		for _, spec := range specs {
			p, err := r.build(r.evidencer(), spec)
			if err != nil {
				return nil, nil, err
			}
			pairs = append(pairs, p)
		}
	}
	if len(pairs) > r.Config.MaxPairs {
		pairs = pairs[:r.Config.MaxPairs]
		t.addReason(ReasonBudgetExhausted)
	}
	var requeue []PairSpec
	for i, d := range r.execute(ctx, fp, pairs) {
		if d == nil {
			continue
		}
		t.add(pairs[i].spec.Org, d.record)
		if d.requeue {
			requeue = append(requeue, pairs[i].spec)
		}
		if err := report.Write(d.record); err != nil {
			return nil, nil, err
		}
	}
	return t, requeue, nil
}

func (r Round) evidencer() parityexec.Evidencer {
	return parityexec.Evidencer{Querier: r.ClickHouse.Querier, Keys: r.Keys}
}

// requeued are the pairs queued by earlier rounds, of tenants of the file only, planned again.
func (r Round) requeued(ctx context.Context, t *tally) []pair {
	specs, err := r.Requeue.Take(ctx)
	if err != nil {
		t.addReason(ReasonRequeueUnavailable)
		return nil
	}
	var pairs []pair
	for _, spec := range specs {
		if !r.Tenants.has(spec.Org) {
			t.addReason(ReasonRequeueInvalid)
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
	return pairs
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
