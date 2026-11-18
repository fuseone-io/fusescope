package implwatchdog

import (
	"context"
	"slices"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/fuseone-io/fusescope/pkg/anomaly"
	"github.com/fuseone-io/fusescope/pkg/anomaly/anomalyquerier"
	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/instrumentation/instrumentationtest"
	"github.com/fuseone-io/fusescope/pkg/querier/queriertest"
	"github.com/fuseone-io/fusescope/pkg/sqlstore"
	qbtypes "github.com/fuseone-io/fusescope/pkg/types/querybuildertypes/querybuildertypesv5"
	"github.com/fuseone-io/fusescope/pkg/types/telemetrytypes"
	"github.com/fuseone-io/fusescope/pkg/types/watchdogtypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
)

var evaluatedWindow = watchdogtypes.NewWindow(storeStart.Add(time.Hour))

// traffic is a service's requests, error ratio and p99 in each current
// bucket; a negative request count leaves the bucket without spans.
type traffic struct {
	requests [watchdogtypes.WindowBuckets]float64
	rate     float64
	p99      float64
}

// world is what the fake querier knows: by season, 0 being the current
// window, the traffic of each service, on the current timeline as timeShift
// results come back.
type world map[int]map[string]traffic

// seasons spreads requests a little around base in each season, so the
// baselines have a scale.
func seasons(w world, service string, base float64) {
	spread := [watchdogtypes.Seasons]float64{-1.0 / 32, -1.0 / 64, 1.0 / 64, 1.0 / 32}
	for k := 1; k <= watchdogtypes.Seasons; k++ {
		if w[k] == nil {
			w[k] = map[string]traffic{}
		}
		v := base * (1 + spread[k-1])
		w[k][service] = traffic{requests: [3]float64{v, v, v}, rate: 0.02, p99: 1e6}
	}
}

func steadyNow(w world, service string, requests float64) {
	if w[0] == nil {
		w[0] = map[string]traffic{}
	}
	w[0][service] = traffic{requests: [3]float64{requests, requests, requests}, rate: 0.02, p99: 1e6}
}

type call struct {
	season   int
	services []any
	limit    int
}

// fakeQuerier answers RED requests from w, applying the services filter and
// the top-N limit, and records every call.
type fakeQuerier struct {
	w     world
	fail  func(call) bool
	mu    sync.Mutex
	calls []call
}

func (f *fakeQuerier) queryRange(_ context.Context, _ valuer.UUID, req *qbtypes.QueryRangeRequest) (*qbtypes.QueryRangeResponse, error) {
	spec := req.CompositeQuery.Queries[0].Spec.(qbtypes.QueryBuilderQuery[qbtypes.TraceAggregation])
	c := call{limit: spec.Limit}
	if len(spec.Functions) > 0 {
		c.season = int(spec.Functions[0].Args[0].Value.(int64) / 86_400)
	}
	if variable, ok := req.Variables["watchdog_services"]; ok {
		c.services = variable.Value.([]any)
	}
	f.mu.Lock()
	f.calls = append(f.calls, c)
	f.mu.Unlock()
	if f.fail != nil && f.fail(c) {
		return nil, errors.Newf(errors.TypeInternal, errors.CodeInternal, "clickhouse is unavailable")
	}

	names := make([]string, 0)
	for service := range f.w[c.season] {
		if c.services == nil || slices.Contains(c.services, any(service)) {
			names = append(names, service)
		}
	}
	total := func(service string) float64 {
		sum := 0.0
		for _, v := range f.w[c.season][service].requests {
			sum += max(v, 0)
		}
		return sum
	}
	slices.SortFunc(names, func(a, b string) int { return int(total(b) - total(a)) })
	names = names[:min(len(names), c.limit)]

	buckets := []*qbtypes.AggregationBucket{{Index: 0}, {Index: 1}, {Index: 2}}
	for _, service := range names {
		t := f.w[c.season][service]
		labels := []*qbtypes.Label{{Key: telemetrytypes.TelemetryFieldKey{Name: "service.name"}, Value: service}}
		series := [3]*qbtypes.TimeSeries{{Labels: labels}, {Labels: labels}, {Labels: labels}}
		for i, timestamp := range evaluatedWindow.Buckets() {
			if t.requests[i] < 0 {
				continue
			}
			series[0].Values = append(series[0].Values, &qbtypes.TimeSeriesValue{Timestamp: timestamp, Value: t.requests[i]})
			series[1].Values = append(series[1].Values, &qbtypes.TimeSeriesValue{Timestamp: timestamp, Value: t.requests[i] * t.rate})
			series[2].Values = append(series[2].Values, &qbtypes.TimeSeriesValue{Timestamp: timestamp, Value: t.p99})
		}
		for i := range buckets {
			if len(series[i].Values) > 0 {
				buckets[i].Series = append(buckets[i].Series, series[i])
			}
		}
	}
	return &qbtypes.QueryRangeResponse{
		Type: qbtypes.RequestTypeTimeSeries,
		Data: qbtypes.QueryData{Results: []any{&qbtypes.TimeSeriesData{QueryName: "A", Aggregations: buckets}}},
	}, nil
}

func newTestOrgEvaluator(t *testing.T, sqlStore sqlstore.SQLStore, w world, maxSeries int) (*orgEvaluator, *fakeQuerier) {
	fake := &fakeQuerier{w: w}
	mock := queriertest.NewMockQuerier()
	mock.QueryRangeFunc = fake.queryRange
	settings := instrumentationtest.New().ToProviderSettings()
	evaluator, err := anomalyquerier.NewEvaluator(settings, mock, anomaly.Config{MaxConcurrent: 2, MaxSeries: maxSeries, MaxPoints: 1_000_000})
	require.NoError(t, err)
	org, err := newOrgEvaluator(settings, evaluator, NewModule(NewStore(sqlStore)), maxSeries)
	require.NoError(t, err)
	return org, fake
}

func activeDetectors(t *testing.T, sqlStore sqlstore.SQLStore) map[string][]string {
	issues, err := NewStore(sqlStore).ListActiveIssues(context.Background(), testOrgID)
	require.NoError(t, err)
	active := map[string][]string{}
	for _, issue := range issues {
		active[issue.Service] = append(active[issue.Service], issue.Detector.StringValue())
	}
	for service := range active {
		slices.Sort(active[service])
	}
	return active
}

func TestOrgEvaluator_Cost(t *testing.T) {
	testCases := []struct {
		name      string
		world     func() world
		active    []string
		maxSeries int
		calls     int
		batches   [][]any
	}{
		{
			name: "OneBatch_NoMissingActive_FiveCalls",
			world: func() world {
				w := world{}
				for _, service := range []string{"cart", "checkout", "frontend"} {
					seasons(w, service, 100)
					steadyNow(w, service, 100)
				}
				return w
			},
			active:    []string{"cart"},
			maxSeries: 5,
			calls:     4 + 1,
			batches:   [][]any{{"cart", "checkout", "frontend"}},
		},
		{
			name: "MaxSeriesServices_OneBatch",
			world: func() world {
				w := world{}
				for _, service := range []string{"cart", "checkout", "frontend"} {
					seasons(w, service, 100)
					steadyNow(w, service, 100)
				}
				return w
			},
			maxSeries: 3,
			calls:     4 + 1,
			batches:   [][]any{{"cart", "checkout", "frontend"}},
		},
		{
			name: "ActivesAboveMaxSeries_ExtraBatches",
			world: func() world {
				w := world{}
				seasons(w, "other", 10)
				return w
			},
			active:    []string{"a", "b", "c"},
			maxSeries: 2,
			calls:     4 + 2,
			batches:   [][]any{{"a", "b"}, {"c"}},
		},
		{
			name: "ActiveCutFromDiscovery_RefetchesItsBaselines",
			world: func() world {
				w := world{}
				seasons(w, "head", 1000)
				seasons(w, "tail", 10)
				return w
			},
			active:    []string{"tail"},
			maxSeries: 1,
			calls:     4 + 1 + 4,
			batches:   [][]any{{"tail"}},
		},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			forEachStore(t, func(t *testing.T, sqlStore sqlstore.SQLStore) {
				for _, service := range testCase.active {
					create(t, NewStore(sqlStore), testOrgID, service, 0)
				}
				org, fake := newTestOrgEvaluator(t, sqlStore, testCase.world(), testCase.maxSeries)

				require.NoError(t, org.evaluate(context.Background(), testOrgID, evaluatedWindow))

				assert.Len(t, fake.calls, testCase.calls)
				var batches [][]any
				for _, c := range fake.calls {
					if c.season == 0 {
						batches = append(batches, c.services)
					}
				}
				assert.Equal(t, testCase.batches, batches)
			})
		})
	}
}

func TestOrgEvaluator_ZeroTraffic(t *testing.T) {
	forEachStore(t, func(t *testing.T, sqlStore sqlstore.SQLStore) {
		w := world{}
		seasons(w, "silent", 100)
		seasons(w, "gappy", 100)
		w[0] = map[string]traffic{"gappy": {requests: [3]float64{-1, -1, 100}, rate: 0.02, p99: 1e6}}
		org, _ := newTestOrgEvaluator(t, sqlStore, w, 10)

		require.NoError(t, org.evaluate(context.Background(), testOrgID, evaluatedWindow))

		assert.Equal(t, map[string][]string{
			"silent": {"throughput_drop"},
			"gappy":  {"throughput_drop"},
		}, activeDetectors(t, sqlStore))
	})
}

func TestOrgEvaluator_ActiveWithoutBaseline_NoData(t *testing.T) {
	forEachStore(t, func(t *testing.T, sqlStore sqlstore.SQLStore) {
		issue := create(t, NewStore(sqlStore), testOrgID, "gone", 0)
		w := world{}
		seasons(w, "other", 100)
		steadyNow(w, "other", 100)
		org, fake := newTestOrgEvaluator(t, sqlStore, w, 10)

		require.NoError(t, org.evaluate(context.Background(), testOrgID, evaluatedWindow))

		assert.Contains(t, fake.calls, call{services: []any{"gone", "other"}, limit: 2})
		stored, err := NewStore(sqlStore).GetActiveIssue(context.Background(), testOrgID, issue.Fingerprint)
		require.NoError(t, err)
		assert.Equal(t, issue.LastEvaluatedAt.UTC(), stored.LastEvaluatedAt.UTC(), "no-data neither increments nor resets")
		assert.Equal(t, 0, stored.CleanEvaluations)
	})
}

func TestOrgEvaluator_Settings(t *testing.T) {
	forEachStore(t, func(t *testing.T, sqlStore sqlstore.SQLStore) {
		module := NewModule(NewStore(sqlStore))
		setting := watchdogtypes.NewDefaultSetting(testOrgID, watchdogtypes.DetectorThroughputDrop)
		setting.Enabled = false
		require.NoError(t, module.PutSetting(context.Background(), setting))
		w := world{}
		seasons(w, "silent", 100)
		org, _ := newTestOrgEvaluator(t, sqlStore, w, 10)

		require.NoError(t, org.evaluate(context.Background(), testOrgID, evaluatedWindow))

		assert.Empty(t, activeDetectors(t, sqlStore))
	})
}

func TestOrgEvaluator_DetectorsDisabled_NoQuery(t *testing.T) {
	forEachStore(t, func(t *testing.T, sqlStore sqlstore.SQLStore) {
		module := NewModule(NewStore(sqlStore))
		for _, detector := range []watchdogtypes.Detector{watchdogtypes.DetectorErrorRate, watchdogtypes.DetectorLatencyP99, watchdogtypes.DetectorThroughputDrop} {
			setting := watchdogtypes.NewDefaultSetting(testOrgID, detector)
			setting.Enabled = false
			require.NoError(t, module.PutSetting(context.Background(), setting))
		}
		org, fake := newTestOrgEvaluator(t, sqlStore, world{}, 10)

		require.NoError(t, org.evaluate(context.Background(), testOrgID, evaluatedWindow))

		assert.Empty(t, fake.calls)
	})
}

func TestOrgEvaluator_DisabledDetector_ExpiredMuteReopens(t *testing.T) {
	testCases := []struct {
		name     string
		disabled []watchdogtypes.Detector
		calls    int
	}{
		{name: "OnlyDetectorDisabled_NoQuery", disabled: []watchdogtypes.Detector{watchdogtypes.DetectorThroughputDrop}, calls: 4 + 1},
		{name: "AllREDDisabled_NoQuery", disabled: []watchdogtypes.Detector{watchdogtypes.DetectorErrorRate, watchdogtypes.DetectorLatencyP99, watchdogtypes.DetectorThroughputDrop}, calls: 0},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			forEachStore(t, func(t *testing.T, sqlStore sqlstore.SQLStore) {
				ctx := context.Background()
				s := NewStore(sqlStore)
				issue := create(t, s, testOrgID, "muted", 0)
				until := time.Now().Add(-time.Minute)
				next := *issue
				require.NoError(t, next.Mute(until, until.Add(-time.Hour)))
				saved, err := s.SaveChange(ctx, issue, &watchdogtypes.Change{Transition: watchdogtypes.TransitionUpdated, Issue: &next, End: issue.LastEvaluatedAt.Add(time.Minute)})
				require.NoError(t, err)
				require.True(t, saved)
				for _, detector := range testCase.disabled {
					setting := watchdogtypes.NewDefaultSetting(testOrgID, detector)
					setting.Enabled = false
					require.NoError(t, NewModule(s).PutSetting(ctx, setting))
				}
				w := world{}
				seasons(w, "other", 100)
				steadyNow(w, "other", 95)
				org, fake := newTestOrgEvaluator(t, sqlStore, w, 10)

				require.NoError(t, org.evaluate(ctx, testOrgID, evaluatedWindow))

				stored, err := s.GetActiveIssue(ctx, testOrgID, issue.Fingerprint)
				require.NoError(t, err)
				assert.Equal(t, watchdogtypes.StatusOpen, stored.Status)
				assert.Nil(t, stored.MutedUntil)
				assert.Equal(t, issue.CleanEvaluations, stored.CleanEvaluations)
				assert.Len(t, fake.calls, testCase.calls)
				for _, c := range fake.calls {
					assert.NotContains(t, c.services, any("muted"))
				}
			})
		})
	}
}

func TestOrgEvaluator_FailedQuery_ExpiredMuteReopens(t *testing.T) {
	testCases := []struct {
		name string
		fail func(call) bool
	}{
		{name: "Discovery", fail: func(c call) bool { return c.season > 0 && c.services == nil }},
		{name: "CurrentWindow", fail: func(c call) bool { return c.season == 0 }},
		{name: "Refetch", fail: func(c call) bool { return c.season > 0 && c.services != nil }},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			forEachStore(t, func(t *testing.T, sqlStore sqlstore.SQLStore) {
				ctx := context.Background()
				s := NewStore(sqlStore)
				issue := create(t, s, testOrgID, "muted", 0)
				until := time.Now().Add(-time.Minute)
				next := *issue
				require.NoError(t, next.Mute(until, until.Add(-time.Hour)))
				saved, err := s.SaveChange(ctx, issue, &watchdogtypes.Change{Transition: watchdogtypes.TransitionUpdated, Issue: &next, End: issue.LastEvaluatedAt.Add(time.Minute)})
				require.NoError(t, err)
				require.True(t, saved)
				w := world{}
				seasons(w, "busy", 1000)
				steadyNow(w, "muted", 100)
				org, fake := newTestOrgEvaluator(t, sqlStore, w, 1)
				fake.fail = testCase.fail

				assert.Error(t, org.evaluate(ctx, testOrgID, evaluatedWindow))
				assert.True(t, slices.ContainsFunc(fake.calls, testCase.fail), "the failing query ran")

				stored, err := s.GetActiveIssue(ctx, testOrgID, issue.Fingerprint)
				require.NoError(t, err)
				assert.Equal(t, watchdogtypes.StatusOpen, stored.Status)
				assert.Nil(t, stored.MutedUntil)
				assert.Equal(t, issue.CleanEvaluations, stored.CleanEvaluations)
			})
		})
	}
}
