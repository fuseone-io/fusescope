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
	p99   float64
	extra uint64
	drift bool
}

func (s *store) QueryRange(_ context.Context, _ valuer.UUID, req *qbtypes.QueryRangeRequest) (*qbtypes.QueryRangeResponse, error) {
	q, _ := req.CompositeQuery.Queries[0].Spec.(qbtypes.QueryBuilderQuery[qbtypes.TraceAggregation])
	switch req.RequestType {
	case qbtypes.RequestTypeTimeSeries:
		var buckets []*qbtypes.AggregationBucket
		if len(q.Aggregations) == 2 && q.Aggregations[1].Expression == "count_distinct(span_id)" {
			for i := range q.Aggregations {
				var values []*qbtypes.TimeSeriesValue
				for ts := req.Start - req.Start%60_000; ts < req.End; ts += 60_000 {
					v := 10.0
					if s.drift && ts == req.Start {
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
	return []*servicetypesv1.ResponseItem{{ServiceName: secretService, Percentile99: f.s.p99, NumCalls: 5 + f.s.extra}}, nil, nil
}

func (f svcFake) GetTopOperations(context.Context, valuer.UUID, *servicetypesv1.OperationsRequest) ([]servicetypesv1.OperationItem, []string, error) {
	return []servicetypesv1.OperationItem{{Name: "GET", P99: 5, NumCalls: 5}}, nil, nil
}

func (f svcFake) GetEntryPointOperations(ctx context.Context, org valuer.UUID, req *servicetypesv1.OperationsRequest) ([]servicetypesv1.OperationItem, []string, error) {
	return f.GetTopOperations(ctx, org, req)
}

func (traceFake) GetTraceSummary(context.Context, valuer.UUID, string) (*spantypes.TraceStats, []string, error) {
	return &spantypes.TraceStats{TotalSpans: 5}, nil, nil
}

func (traceFake) GetWaterfallV4(context.Context, valuer.UUID, string, string, []string) (*spantypes.GettableWaterfallTrace, []string, error) {
	return &spantypes.GettableWaterfallTrace{}, nil, nil
}

type svcFake struct {
	services.Module
	s *store
}

type traceFake struct{ tracedetail.Module }

func graphOf(s *store) *parityexec.Graph {
	return &parityexec.Graph{Querier: s, Services: svcFake{s: s}, TraceDetail: traceFake{}}
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
		KeyStore: keys, Reports: FileSink{Dir: dir}, Health: healthy{}, Metrics: push,
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
