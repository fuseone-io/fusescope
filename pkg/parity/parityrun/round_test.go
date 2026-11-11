package parityrun

import (
	"context"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/modules/services"
	"github.com/fuseone-io/fusescope/pkg/modules/tracedetail"
	"github.com/fuseone-io/fusescope/pkg/parity"
	"github.com/fuseone-io/fusescope/pkg/parity/parityexec"
	"github.com/fuseone-io/fusescope/pkg/querier"
	"github.com/fuseone-io/fusescope/pkg/telemetrystore"
	qbtypes "github.com/fuseone-io/fusescope/pkg/types/querybuildertypes/querybuildertypesv5"
	"github.com/fuseone-io/fusescope/pkg/types/servicetypes/servicetypesv1"
	"github.com/fuseone-io/fusescope/pkg/types/spantypes"
	"github.com/fuseone-io/fusescope/pkg/types/telemetrytypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
)

// The tenant data of the fake stores: none of it may reach the report.
const (
	secretService = "secret-checkout"
	secretTrace   = "0123456789abcdef0123456789abcdef"
	secretRoute   = "/secret/route"
	secretSQL     = "SELECT secret FROM spans"
)

// store answers every query of the round the same way on both sides, unless p99 is changed.
type store struct {
	querier.Querier
	p99         float64
	extra       uint64
	drift       bool
	partial     bool
	traceDelay  time.Duration
	delay       time.Duration
	services    []string
	ops         []string
	extraCounts bool
}

func (s *store) QueryRange(_ context.Context, _ valuer.UUID, req *qbtypes.QueryRangeRequest) (*qbtypes.QueryRangeResponse, error) {
	time.Sleep(s.delay)
	q, _ := req.CompositeQuery.Queries[0].Spec.(qbtypes.QueryBuilderQuery[qbtypes.TraceAggregation])
	switch req.RequestType {
	case qbtypes.RequestTypeTimeSeries:
		var buckets []*qbtypes.AggregationBucket
		if len(q.Aggregations) == 2 && q.Aggregations[1].Expression == "count_distinct(span_id)" {
			for i := range q.Aggregations {
				var values []*qbtypes.TimeSeriesValue
				for ts := req.Start - req.Start%60_000; ts < req.End; ts += 60_000 {
					v := 10.0
					if s.drift && ts == req.Start || s.extraCounts {
						v = 11
					}
					values = append(values, &qbtypes.TimeSeriesValue{Timestamp: int64(ts), Value: v})
				}
				buckets = append(buckets, &qbtypes.AggregationBucket{Index: i, Series: []*qbtypes.TimeSeries{{
					Labels: []*qbtypes.Label{{Key: telemetrytypes.TelemetryFieldKey{Name: "service.name"}, Value: secretService}},
					Values: values,
				}}})
			}
		}
		return &qbtypes.QueryRangeResponse{Type: req.RequestType, Data: qbtypes.QueryData{Results: []any{&qbtypes.TimeSeriesData{QueryName: "A", Aggregations: buckets}}}}, nil
	case qbtypes.RequestTypeScalar:
		row := []any{}
		if len(q.GroupBy) > 0 {
			switch q.GroupBy[0].Name {
			case "trace_id":
				row = append(row, secretTrace)
			case "name":
				if len(s.ops) > 0 {
					var rows [][]any
					for _, op := range s.ops {
						rows = append(rows, []any{op, uint64(5)})
					}
					return &qbtypes.QueryRangeResponse{Type: req.RequestType, Data: qbtypes.QueryData{Results: []any{&qbtypes.ScalarData{QueryName: "A", Data: rows}}}}, nil
				}
				row = append(row, "GET")
			default:
				row = append(row, secretRoute)
			}
		}
		for range q.Aggregations {
			row = append(row, uint64(5))
		}
		return &qbtypes.QueryRangeResponse{Type: req.RequestType, Data: qbtypes.QueryData{Results: []any{&qbtypes.ScalarData{QueryName: "A", Data: [][]any{row}}}}}, nil
	}
	return &qbtypes.QueryRangeResponse{Type: req.RequestType, Data: qbtypes.QueryData{Results: []any{&qbtypes.RawData{QueryName: "A"}}}}, nil
}

func (f svcFake) Get(context.Context, valuer.UUID, *servicetypesv1.Request) ([]*servicetypesv1.ResponseItem, []string, error) {
	time.Sleep(f.s.delay)
	items := []*servicetypesv1.ResponseItem{{ServiceName: secretService, Percentile99: f.s.p99, NumCalls: 5 + f.s.extra}}
	for _, name := range f.s.services {
		items = append(items, &servicetypesv1.ResponseItem{ServiceName: name, Percentile99: f.s.p99, NumCalls: 5})
	}
	return items, nil, nil
}

func (f svcFake) GetTopOperations(context.Context, valuer.UUID, *servicetypesv1.OperationsRequest) ([]servicetypesv1.OperationItem, []string, error) {
	return []servicetypesv1.OperationItem{{Name: "GET", P99: 5, NumCalls: 5}}, nil, nil
}

func (f svcFake) GetEntryPointOperations(ctx context.Context, org valuer.UUID, req *servicetypesv1.OperationsRequest) ([]servicetypesv1.OperationItem, []string, error) {
	return f.GetTopOperations(ctx, org, req)
}

func (f traceFake) GetTraceSummary(context.Context, valuer.UUID, string) (*spantypes.TraceStats, []string, error) {
	time.Sleep(f.s.traceDelay)
	if f.s.partial {
		return &spantypes.TraceStats{TotalSpans: 5}, []string{telemetrystore.PartialWarning(telemetrystore.PartialIngesterUnavailable)}, nil
	}
	return &spantypes.TraceStats{TotalSpans: 5}, nil, nil
}

func (traceFake) GetWaterfallV4(context.Context, valuer.UUID, string, string, []string) (*spantypes.GettableWaterfallTrace, []string, error) {
	return &spantypes.GettableWaterfallTrace{}, nil, nil
}

type svcFake struct {
	services.Module
	s *store
}

type traceFake struct {
	tracedetail.Module
	s *store
}

func graphOf(s *store) *parityexec.Graph {
	return &parityexec.Graph{Querier: s, Services: svcFake{s: s}, TraceDetail: traceFake{s: s}}
}

type healthy struct{}

func (healthy) Failures(context.Context, time.Time, time.Time) ([]parity.ExporterFailure, error) {
	return nil, nil
}

type pusher struct {
	mu       sync.Mutex
	pushed   int
	families []string
	err      error
}

func (p *pusher) Push(_ context.Context, r *prometheus.Registry) error {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.pushed++
	families, _ := r.Gather()
	for _, f := range families {
		p.families = append(p.families, f.GetName())
	}
	return p.err
}

type capturedKeys struct {
	MemoryKeyStore
	ids  []string
	keys [][]byte
}

func (c *capturedKeys) Store(_ context.Context, id string, key []byte) error {
	c.ids, c.keys = append(c.ids, id), append(c.keys, append([]byte(nil), key...))
	return nil
}

func round(t *testing.T, engine, clickhouse *store) (Round, *capturedKeys, *pusher, string) {
	t.Helper()
	tenants, err := ParseTenants(strings.NewReader(tenantsYAML(tenantA)))
	require.NoError(t, err)
	keys, push, dir := &capturedKeys{}, &pusher{}, t.TempDir()
	cfg := DefaultConfig()
	cfg.Sample.Services, cfg.Sample.Operations = 2, 2
	return Round{
		Engine: graphOf(engine), ClickHouse: graphOf(clickhouse), Refuser: parityexec.NewRefuser(),
		Keys: numericKeys{}, Tenants: tenants,
		KeyStore: keys, Reports: FileSink{Dir: dir}, Health: healthy{}, Metrics: push, Requeue: NewMemoryRequeue(),
		Config: cfg, Seed: 7,
		Now: func() time.Time { return time.Date(2026, 11, 10, 12, 0, 30, 0, time.UTC) },
	}, keys, push, dir
}

type numericKeys struct{}

func (numericKeys) GetKeysMulti(_ context.Context, _ valuer.UUID, selectors []*telemetrytypes.FieldKeySelector) (map[string][]*telemetrytypes.TelemetryFieldKey, bool, error) {
	out := map[string][]*telemetrytypes.TelemetryFieldKey{}
	for _, s := range selectors {
		out[s.Name] = []*telemetrytypes.TelemetryFieldKey{{Name: s.Name, FieldDataType: telemetrytypes.FieldDataTypeInt64}}
	}
	return out, true, nil
}

func lines(t *testing.T, dir string) (string, []map[string]any) {
	t.Helper()
	files, err := filepath.Glob(filepath.Join(dir, "*.jsonl"))
	require.NoError(t, err)
	require.Len(t, files, 1)
	raw, err := os.ReadFile(files[0])
	require.NoError(t, err)
	var out []map[string]any
	for _, l := range strings.Split(strings.TrimSpace(string(raw)), "\n") {
		var m map[string]any
		require.NoError(t, json.Unmarshal([]byte(l), &m))
		out = append(out, m)
	}
	return string(raw), out
}

func kindsOf(records []map[string]any) map[string]int {
	out := map[string]int{}
	for _, r := range records {
		out[r["kind"].(string)]++
	}
	return out
}

func TestARoundThatMatchesQualifies(t *testing.T) {
	r, keys, push, dir := round(t, &store{p99: 5}, &store{p99: 5})
	summary, err := r.Run(context.Background())
	require.NoError(t, err)
	assert.True(t, summary.Qualifying, "%v", summary.Reasons)
	_, records := lines(t, dir)
	kinds := kindsOf(records)
	assert.Equal(t, 1, kinds["header"])
	assert.Equal(t, 1, kinds["summary"])
	assert.Positive(t, kinds["pair"])
	views := map[string]bool{}
	for _, rec := range records {
		if rec["kind"] == "pair" {
			views[rec["view"].(string)] = true
			assert.Equal(t, "match", rec["outcome"], "%v", rec)
		}
	}
	for _, view := range []string{"services", "top_operations", "entry_operations", "span_list", "time_series", "scalar", "summary", "waterfall", "absent_key"} {
		assert.True(t, views[view], view)
	}
	require.Len(t, keys.ids, 1)
	assert.True(t, strings.HasPrefix(keys.ids[0], "parity-run-"))
	assert.Equal(t, keys.ids[0], records[0]["run_key_id"])
	assert.Len(t, keys.keys[0], parity.MinRunKeyBytes)
	assert.Equal(t, 1, push.pushed)
	assert.ElementsMatch(t, []string{"fusescope_parity_pairs_total", "fusescope_parity_request_duration_seconds", "fusescope_parity_coverage_ratio"}, push.families)
}

func TestTheReportCarriesNoTenantDataNoStatementAndNoKey(t *testing.T) {
	engine := &store{p99: 9, extra: 1, drift: true}
	r, keys, _, dir := round(t, engine, &store{p99: 5})
	_, err := r.Run(context.Background())
	require.NoError(t, err)
	raw, records := lines(t, dir)
	assert.Positive(t, kindsOf(records)["gate"], "a gate minute names its service too")
	for _, secret := range []string{secretService, secretTrace, secretRoute, secretSQL, orgA, "SELECT"} {
		assert.NotContains(t, raw, secret)
	}
	key := keys.keys[0]
	for _, encoded := range []string{hex.EncodeToString(key), base64.StdEncoding.EncodeToString(key), base64.RawURLEncoding.EncodeToString(key)} {
		assert.NotContains(t, raw, encoded)
	}
}

func TestADifferenceBlocksTheRound(t *testing.T) {
	r, _, _, dir := round(t, &store{p99: 5, extra: 1}, &store{p99: 5})
	summary, err := r.Run(context.Background())
	require.NoError(t, err)
	assert.False(t, summary.Qualifying)
	_, records := lines(t, dir)
	var found bool
	for _, rec := range records {
		if rec["kind"] == "pair" && rec["view"] == "services" {
			found = true
			assert.Equal(t, "differ", rec["outcome"])
			assert.Equal(t, "blocking", rec["disposition"])
			diffs := rec["differences"].([]any)
			require.NotEmpty(t, diffs)
			assert.Contains(t, diffs[0].(map[string]any)["path"], "numCalls", "contract fields stay plain")
		}
	}
	assert.True(t, found)
}

func TestARoundWithoutHealthDoesNotQualify(t *testing.T) {
	r, _, _, dir := round(t, &store{p99: 5}, &store{p99: 5})
	r.Health = nil
	summary, err := r.Run(context.Background())
	require.NoError(t, err)
	assert.False(t, summary.Qualifying)
	assert.Contains(t, summary.Reasons, "health_unavailable")
	_, records := lines(t, dir)
	assert.Zero(t, kindsOf(records)["pair"], "every minute is unobserved: nothing is compared")
}

func TestAFailedMetricsPushFailsTheRound(t *testing.T) {
	r, _, push, dir := round(t, &store{p99: 5}, &store{p99: 5})
	push.err = errors.Newf(errors.TypeInternal, errors.CodeInternal, "unreachable")
	summary, err := r.Run(context.Background())
	require.Error(t, err)
	assert.False(t, summary.Qualifying)
	assert.Contains(t, summary.Reasons, "metrics_push_failed")
	_, records := lines(t, dir)
	assert.Equal(t, 1, kindsOf(records)["summary"], "the report is still published, marked")
}

func TestAPairTakesItsWorstDisposition(t *testing.T) {
	rec := PairRecord{Outcome: "match"}
	for _, d := range []parity.Disposition{parity.Accepted, parity.Blocking, parity.Inconclusive} {
		takeWorst(&rec, parity.Verdict{Category: parity.Category(d), Disposition: d})
	}
	assert.Equal(t, PairRecord{Outcome: "differ", Category: "blocking", Disposition: parity.Blocking}, rec)
}

func summaryPairs(records []map[string]any) []map[string]any {
	var out []map[string]any
	for _, r := range records {
		if r["kind"] == "pair" && r["view"] == ViewSummary {
			out = append(out, r)
		}
	}
	return out
}

func TestAPartialPairRunsAgainNextRound(t *testing.T) {
	engine := &store{p99: 5, partial: true}
	r, _, _, dir := round(t, engine, &store{p99: 5})
	_, err := r.Run(context.Background())
	require.NoError(t, err)
	_, records := lines(t, dir)
	summaries := summaryPairs(records)
	require.NotEmpty(t, summaries)
	assert.Equal(t, "partial", summaries[0]["category"])

	queued, _, err := r.Requeue.Load(context.Background())
	require.NoError(t, err)
	require.NotEmpty(t, queued, "the partial pair is queued, whole")
	assert.Equal(t, "summary", queued[0].View)

	engine.partial = false
	next := r
	next.Now = func() time.Time { return r.Now().Add(time.Hour) }
	next.Reports = FileSink{Dir: t.TempDir()}
	_, err = next.Run(context.Background())
	require.NoError(t, err)
	_, records = lines(t, next.Reports.(FileSink).Dir)
	var requeued int
	for _, rec := range summaryPairs(records) {
		if rec["requeued"] == true {
			requeued++
			assert.Equal(t, "match", rec["outcome"])
		}
	}
	assert.Equal(t, len(queued), requeued)
	left, _, err := next.Requeue.Load(context.Background())
	require.NoError(t, err)
	assert.Empty(t, left, "a pair that ran whole leaves the queue")
}

type brokenQueue struct{ load, replace error }

func (b brokenQueue) Load(context.Context) ([]PairSpec, string, error)  { return nil, "v", b.load }
func (b brokenQueue) Replace(context.Context, string, []PairSpec) error { return b.replace }

func TestARequeueThatFailsMakesTheRoundUnusable(t *testing.T) {
	r, _, _, _ := round(t, &store{p99: 5}, &store{p99: 5})
	r.Requeue = brokenQueue{load: errors.Newf(errors.TypeInternal, errors.CodeInternal, "down")}
	summary, err := r.Run(context.Background())
	require.NoError(t, err)
	assert.False(t, summary.Usable)
	assert.Contains(t, summary.Reasons, ReasonRequeueUnavailable)

	r, _, _, _ = round(t, &store{p99: 5, partial: true}, &store{p99: 5})
	r.Requeue = brokenQueue{replace: errors.Newf(errors.TypeInternal, errors.CodeInternal, "down")}
	summary, err = r.Run(context.Background())
	require.NoError(t, err)
	assert.False(t, summary.Usable)
	assert.Contains(t, summary.Reasons, ReasonRequeueFailed)
}

func TestARequeuedPairOfAnotherTenantIsRefused(t *testing.T) {
	r, _, _, dir := round(t, &store{p99: 5}, &store{p99: 5})
	r.Requeue = queueOf(t, PairSpec{View: "summary", Org: orgB, Class: parity.Settled, TraceID: secretTrace, Window: minuteWindow})
	summary, err := r.Run(context.Background())
	require.NoError(t, err)
	assert.Contains(t, summary.Reasons, ReasonRequeueInvalid)
	_, records := lines(t, dir)
	for _, rec := range summaryPairs(records) {
		assert.NotEqual(t, true, rec["requeued"])
	}
}

func queueOf(t *testing.T, specs ...PairSpec) *MemoryRequeue {
	t.Helper()
	q := NewMemoryRequeue()
	_, version, err := q.Load(context.Background())
	require.NoError(t, err)
	require.NoError(t, q.Replace(context.Background(), version, specs))
	return q
}

// queuedSummary is a summary pair of the settled window an hour before the round.
func queuedSummary(t *testing.T, r Round) PairSpec {
	t.Helper()
	w, ok, err := parity.PlanWindow(r.Config.Window, parity.Settled, r.Now().Add(-time.Hour), r.Tenants.Tenants[0].DualWriteEpoch, r.Tenants.Tenants[0].Retention)
	require.NoError(t, err)
	require.True(t, ok)
	return PairSpec{View: ViewSummary, Org: orgA, Class: parity.Settled, Window: w, TraceID: "1111111111111111111111111111111a", Spans: 1, Reason: parity.ReasonRandom}
}

func TestACancelledRoundLeavesTheQueueAsItWas(t *testing.T) {
	r, _, _, _ := round(t, &store{p99: 5, delay: 30 * time.Millisecond}, &store{p99: 5})
	spec := queuedSummary(t, r)
	r.Requeue = queueOf(t, spec)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Millisecond)
	defer cancel()
	_, err := r.Run(ctx)
	require.Error(t, err)
	left, _, err := r.Requeue.Load(context.Background())
	require.NoError(t, err)
	assert.Equal(t, []PairSpec{spec}, left, "nothing is lost")
}

// staleQueue is a queue another writer changed since it was loaded.
type staleQueue struct{ *MemoryRequeue }

func (q *staleQueue) Replace(ctx context.Context, _ string, specs []PairSpec) error {
	return q.MemoryRequeue.Replace(ctx, "stale", specs)
}

func TestAQueueThatCannotBeReplacedKeepsItsSpecs(t *testing.T) {
	r, _, _, _ := round(t, &store{p99: 5, partial: true}, &store{p99: 5})
	spec := queuedSummary(t, r)
	q := &staleQueue{MemoryRequeue: queueOf(t, spec)}
	r.Requeue = q
	summary, err := r.Run(context.Background())
	require.NoError(t, err)
	assert.Contains(t, summary.Reasons, ReasonRequeueFailed)
	left, _, err := q.Load(context.Background())
	require.NoError(t, err)
	assert.Equal(t, []PairSpec{spec}, left)
}

func TestARequeuedPairGoesThroughItsWindowsGateFirst(t *testing.T) {
	r, _, _, dir := round(t, &store{p99: 5, extraCounts: true}, &store{p99: 5})
	spec := queuedSummary(t, r)
	r.Requeue = queueOf(t, spec)
	_, err := r.Run(context.Background())
	require.NoError(t, err)
	_, records := lines(t, dir)
	for _, rec := range summaryPairs(records) {
		assert.NotEqual(t, true, rec["requeued"], "its window diverges now: it does not run")
	}
	left, _, err := r.Requeue.Load(context.Background())
	require.NoError(t, err)
	assert.Contains(t, left, spec, "and stays queued")
}

func TestARequeuedPairBeyondRetentionLeavesTheQueue(t *testing.T) {
	r, _, _, dir := round(t, &store{p99: 5}, &store{p99: 5})
	spec := queuedSummary(t, r)
	spec.Window = parity.Window{Start: spec.Window.Start - int64(800*time.Hour), End: spec.Window.End - int64(800*time.Hour)}
	r.Requeue = queueOf(t, spec)
	_, err := r.Run(context.Background())
	require.NoError(t, err)
	left, _, err := r.Requeue.Load(context.Background())
	require.NoError(t, err)
	assert.NotContains(t, left, spec)
	_, records := lines(t, dir)
	for _, rec := range summaryPairs(records) {
		assert.NotEqual(t, true, rec["requeued"], "an expired pair does not run")
	}
}

func TestARequeuedTraceIsCountedAgainAndQueuedOnce(t *testing.T) {
	r, _, _, _ := round(t, &store{p99: 5, partial: true}, &store{p99: 5})
	spec := queuedSummary(t, r)
	r.Requeue = queueOf(t, spec, spec)
	_, err := r.Run(context.Background())
	require.NoError(t, err)
	left, _, err := r.Requeue.Load(context.Background())
	require.NoError(t, err)
	refreshed := spec
	refreshed.Spans = 5
	var copies int
	for _, s := range left {
		if s.TraceID == spec.TraceID && s.Window == spec.Window {
			copies++
			assert.Equal(t, refreshed, s, "its span count read again")
		}
	}
	assert.Equal(t, 1, copies, "a repeated spec is queued once")
}

func TestARequeuedPairTheRoundDoesNotReachStaysQueued(t *testing.T) {
	r, _, _, _ := round(t, &store{p99: 5}, &store{p99: 5})
	first, second := queuedSummary(t, r), queuedSummary(t, r)
	second.TraceID = "2222222222222222222222222222222b"
	r.Requeue = queueOf(t, first, second)
	r.Config.MaxPairs = 1
	_, err := r.Run(context.Background())
	require.NoError(t, err)
	left, _, err := r.Requeue.Load(context.Background())
	require.NoError(t, err)
	var ids []string
	for _, s := range left {
		ids = append(ids, s.TraceID)
	}
	assert.Equal(t, []string{second.TraceID}, ids, "the first ran and left; the second waits for a later round")
}

func TestARequeuedPairTheBudgetCutsStaysQueued(t *testing.T) {
	r, _, _, _ := round(t, &store{p99: 5, traceDelay: 400 * time.Millisecond}, &store{p99: 5})
	spec := queuedSummary(t, r)
	r.Requeue = queueOf(t, spec)
	r.Config.Budget = 200 * time.Millisecond
	_, err := r.Run(context.Background())
	require.NoError(t, err)
	left, _, err := r.Requeue.Load(context.Background())
	require.NoError(t, err)
	spec.Spans = 5
	assert.Contains(t, left, spec, "it was cut while it ran, its span count read again")
}

func TestAnInvalidQueuedSpecLeavesTheQueueAndMakesTheRoundUnusable(t *testing.T) {
	base := func(r Round) PairSpec { return queuedSummary(t, r) }
	cases := map[string]func(*PairSpec){
		"an unknown view":     func(s *PairSpec) { s.View = "flamegraph" },
		"an unknown class":    func(s *PairSpec) { s.Class = "warm" },
		"a misaligned window": func(s *PairSpec) { s.Window.Start++ },
		"an empty window":     func(s *PairSpec) { s.Window.End = s.Window.Start },
		"before the dual write": func(s *PairSpec) {
			s.Window.Start, s.Window.End = s.Window.Start-int64(20*24*time.Hour), s.Window.End-int64(20*24*time.Hour)
		},
		"a malformed trace id":     func(s *PairSpec) { s.TraceID = "not-a-trace" },
		"operations of no service": func(s *PairSpec) { s.View, s.TraceID = ViewTopOperations, "" },
		"an operation of no name":  func(s *PairSpec) { s.View, s.TraceID, s.Service = ViewSpanList, "", "cart" },
		"an absent key of no case": func(s *PairSpec) { s.View, s.TraceID = ViewAbsentKey, "" },
		"an absent key not promoted": func(s *PairSpec) {
			s.View, s.TraceID, s.Case = ViewAbsentKey, "", &parity.AbsentKeyCase{Attribute: "user.id", Operator: "EXISTS", Shape: parity.ShapeList, Filter: "user.id EXISTS"}
		},
		"an absent key of no shape": func(s *PairSpec) {
			s.View, s.TraceID, s.Case = ViewAbsentKey, "", &parity.AbsentKeyCase{Attribute: "http.route", Operator: "EXISTS", Shape: "bar", Filter: "http.route EXISTS"}
		},
	}
	for name, mutate := range cases {
		r, _, _, _ := round(t, &store{p99: 5}, &store{p99: 5})
		spec := base(r)
		mutate(&spec)
		r.Requeue = queueOf(t, spec)
		summary, err := r.Run(context.Background())
		require.NoError(t, err, name)
		assert.Contains(t, summary.Reasons, ReasonRequeueInvalid, name)
		assert.False(t, summary.Usable, name)
		left, _, err := r.Requeue.Load(context.Background())
		require.NoError(t, err, name)
		assert.NotContains(t, left, spec, "%s: an invalid spec never comes back", name)
	}
}

func TestAQueuedSpecTheRoundAlsoSamplesIsPlannedOnce(t *testing.T) {
	r, _, _, dir := round(t, &store{p99: 5}, &store{p99: 5})
	w, ok, err := parity.PlanWindow(r.Config.Window, parity.Settled, r.Now(), r.Tenants.Tenants[0].DualWriteEpoch, r.Tenants.Tenants[0].Retention)
	require.NoError(t, err)
	require.True(t, ok)
	queued := PairSpec{View: ViewSummary, Org: orgA, Class: parity.Settled, Window: w, TraceID: secretTrace, Spans: 1, Reason: parity.ReasonWithError}
	r.Requeue = queueOf(t, queued)
	summary, err := r.Run(context.Background())
	require.NoError(t, err)
	c := coverageOf(summary, ViewSummary)
	assert.Equal(t, c.Planned, c.Reached, "the queued and the sampled spec are one pair, whatever their reason")
	assert.NotContains(t, summary.Reasons, ReasonCoverage)
	_, records := lines(t, dir)
	var requeued, settled int
	for _, rec := range summaryPairs(records) {
		if rec["requeued"] == true {
			requeued++
		}
		if rec["window_class"] == string(parity.Settled) {
			settled++
		}
	}
	assert.Equal(t, 1, requeued)
	assert.Equal(t, 1, settled, "one pair for the settled window's trace, not one a reason")
}
