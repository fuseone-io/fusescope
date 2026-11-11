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
	ReasonHealthUnavailable  = "health_unavailable"
	ReasonDataUnavailable    = "data_unavailable"
	ReasonBlockingDifference = "blocking_difference"
	ReasonSettledDivergence  = "settled_divergence"
	ReasonBudgetExhausted    = "budget_exhausted"
	ReasonMetricsPushFailed  = "metrics_push_failed"
)

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
	Build           BuildInfo
}

// DefaultConfig is the design's: 2 pairs at once, 30 s a call, and the engine's and the trace
// detail's own default limits.
func DefaultConfig() Config {
	return Config{
		Window: parity.DefaultWindowConfig(), Sample: parity.DefaultSampleConfig(),
		Limits:          parity.TraceLimits{MaxRows: 1_000_000, WindowedAbove: 10_000},
		OperationsLimit: 10, ListLimit: 100,
		Deadline: 30 * time.Second, RetryWait: 5 * time.Second,
		Concurrency: 2, MaxPairs: 5_000, Budget: 50 * time.Minute,
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
	Config   Config
	Seed     parity.Seed
	Now      func() time.Time
}

// RunID is a round's id: its start, to the second, and its seed, as a Secret name may hold them.
func RunID(start time.Time, seed parity.Seed) string {
	return start.UTC().Format("20060102t150405z") + "-" + strconv.FormatUint(uint64(seed), 10)
}

// Run runs the round and publishes its report. The run key is stored before anything is read.
//
// # Errors
//
// A missing dependency, a run key that cannot be made or stored, a report that cannot be written,
// or metrics that cannot be pushed; the report is still published, marked, in the last case.
func (r Round) Run(ctx context.Context) (Summary, error) {
	if r.Engine == nil || r.ClickHouse == nil || r.Refuser == nil || r.Keys == nil || r.KeyStore == nil || r.Reports == nil || r.Metrics == nil || r.Now == nil {
		return Summary{}, errors.Newf(errors.TypeInvalidInput, ErrCodeRound, "a round needs both graphs, the refuser, the keys, the key store, the reports, the metrics and a clock")
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
	summary, err := r.run(ctx, start, runID, keyID, fp, report)
	if err != nil {
		_ = report.Abort()
		return Summary{}, err
	}
	metrics := NewMetrics()
	summary.observe(metrics)
	pushErr := r.Metrics.Push(ctx, metrics.Registry())
	if pushErr != nil {
		summary.addReason(ReasonMetricsPushFailed)
	}
	summary.Qualifying = len(summary.Reasons) == 0
	if err := report.Publish(summary.Summary); err != nil {
		return summary.Summary, err
	}
	return summary.Summary, pushErr
}

// window is a tenant's window of one class, as planned.
type window struct {
	tenant Tenant
	class  parity.WindowClass
	w      parity.Window
}

func (r Round) run(ctx context.Context, start time.Time, runID, keyID string, fp *parity.Fingerprinter, report ReportWriter) (*tally, error) {
	header := Header{RunID: runID, RunKeyID: keyID, Seed: uint64(r.Seed), Sample: r.Config.Sample,
		BackendCommit: r.Config.Build.BackendCommit, ImageDigest: r.Config.Build.ImageDigest, EngineVersion: r.Config.Build.EngineVersion}
	var windows []window
	for _, tenant := range r.Tenants.Tenants {
		th := TenantHeader{Tenant: fp.Segment(tenant.Org.StringValue())}
		for _, class := range []parity.WindowClass{parity.Settled, parity.Recent} {
			w, ok, err := parity.PlanWindow(r.Config.Window, class, start, tenant.DualWriteEpoch, tenant.Retention)
			if err != nil {
				return nil, err
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
	if err := report.Write(header); err != nil {
		return nil, err
	}
	t := newTally()
	ev := parityexec.Evidencer{Querier: r.ClickHouse.Querier, Keys: r.Keys}
	var pairs []pair
	for _, win := range windows {
		planned, err := r.plan(ctx, ev, fp, report, t, win)
		if err != nil {
			return nil, err
		}
		pairs = append(pairs, planned...)
	}
	if err := r.execute(ctx, fp, report, t, pairs); err != nil {
		return nil, err
	}
	return t, nil
}
