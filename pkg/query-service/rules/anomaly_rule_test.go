package rules

import (
	"context"
	"encoding/json"
	"net/url"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/fuseone-io/fusescope/pkg/alertmanager/alertmanagerserver"
	alertmanagermock "github.com/fuseone-io/fusescope/pkg/alertmanager/alertmanagertest"
	"github.com/fuseone-io/fusescope/pkg/anomaly"
	"github.com/fuseone-io/fusescope/pkg/anomaly/anomalyquerier"
	"github.com/fuseone-io/fusescope/pkg/instrumentation/instrumentationtest"
	"github.com/fuseone-io/fusescope/pkg/querier/queriertest"
	qbtypes "github.com/fuseone-io/fusescope/pkg/types/querybuildertypes/querybuildertypesv5"
	"github.com/fuseone-io/fusescope/pkg/types/ruletypes"
	"github.com/fuseone-io/fusescope/pkg/types/telemetrytypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const anomalyScale = 1.4826

// anomalyStore answers the current window from current and each season from baseline, on the
// current timeline as the querier returns them after timeShift.
type anomalyStore struct {
	mu       sync.Mutex
	shifts   []int64
	current  []float64
	baseline func(season int) []float64
	block    bool
	// holdFirst, when set, holds the first call until it is closed.
	holdFirst chan struct{}
	calls     int
}

func (s *anomalyStore) callCount() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.calls
}

func (s *anomalyStore) querier() *queriertest.MockQuerier {
	mock := queriertest.NewMockQuerier()
	mock.QueryRangeFunc = func(ctx context.Context, _ valuer.UUID, req *qbtypes.QueryRangeRequest) (*qbtypes.QueryRangeResponse, error) {
		s.mu.Lock()
		s.calls++
		first := s.calls == 1
		s.mu.Unlock()
		if s.block {
			<-ctx.Done()
			return nil, ctx.Err()
		}
		if first && s.holdFirst != nil {
			<-s.holdFirst
		}
		spec := req.CompositeQuery.Queries[0].Spec.(qbtypes.QueryBuilderQuery[qbtypes.MetricAggregation])
		values := s.current
		for _, fn := range spec.Functions {
			if fn.Name == qbtypes.FunctionNameTimeShift {
				shift, err := qbtypes.ParseFunctionArgNumber(fn.Args[0].Value)
				if err != nil {
					return nil, err
				}
				s.mu.Lock()
				s.shifts = append(s.shifts, int64(shift))
				s.mu.Unlock()
				values = s.baseline(int(shift) / 86_400)
			}
		}
		series := &qbtypes.TimeSeries{Labels: []*qbtypes.Label{{Key: telemetrytypes.TelemetryFieldKey{Name: "service"}, Value: "api"}}}
		for i, v := range values {
			series.Values = append(series.Values, &qbtypes.TimeSeriesValue{Timestamp: int64(1_700_000_000_000 + i*60_000), Value: v})
		}
		return &qbtypes.QueryRangeResponse{
			Type: qbtypes.RequestTypeTimeSeries,
			Data: qbtypes.QueryData{Results: []any{&qbtypes.TimeSeriesData{QueryName: "A", Aggregations: []*qbtypes.AggregationBucket{{Series: []*qbtypes.TimeSeries{series}}}}}},
		}, nil
	}
	return mock
}

// noisyBaseline puts the four seasons at -1.5, -0.5, 0.5 and 1.5 around 100: the prediction is
// 100 and the scale 1.4826, whatever the season order.
func noisyBaseline(season int) []float64 {
	offsets := []float64{-1.5, -0.5, 0.5, 1.5}
	values := make([]float64, 10)
	for i := range values {
		values[i] = 100 + offsets[(season+i)%4]
	}
	return values
}

func steadyThen(last float64) []float64 {
	values := []float64{100, 100, 100, 100, 100, 100, 100, 100, 100, last}
	return values
}

func anomalyRuleFromJSON(t *testing.T, replace ...string) *ruletypes.PostableRule {
	t.Helper()
	raw := `{
		"alert": "RequestsAnomaly",
		"version": "v5",
		"ruleType": "anomaly_rule",
		"alertType": "METRIC_BASED_ALERT",
		"evalWindow": "10m",
		"frequency": "1m",
		"condition": {
			"compositeQuery": {
				"queryType": "builder",
				"unit": "bytes",
				"queries": [{
					"type": "builder_query",
					"spec": {
						"name": "A",
						"signal": "metrics",
						"aggregations": [{"metricName": "requests", "timeAggregation": "rate", "spaceAggregation": "sum"}],
						"functions": [{"name": "anomaly", "args": [{"name": "z_score_threshold", "value": 5}, {"name": "seasonality", "value": "hourly"}]}]
					}
				}]
			},
			"target": 3,
			"matchType": "1",
			"op": "1",
			"seasonality": "daily",
			"selectedQueryName": "A"
		},
		"labels": {"severity": "warning"},
		"annotations": {"summary": "{{$value}} > {{$threshold}}"}
	}`
	for i := 0; i+1 < len(replace); i += 2 {
		raw = strings.Replace(raw, replace[i], replace[i+1], 1)
	}
	rule := &ruletypes.PostableRule{}
	require.NoError(t, json.Unmarshal([]byte(raw), rule))
	require.NoError(t, rule.Validate())
	return rule
}

func newAnomalyTestRule(t *testing.T, rule *ruletypes.PostableRule, store *anomalyStore, config anomaly.Config) *ThresholdRule {
	t.Helper()
	settings := instrumentationtest.New()
	evaluator, err := anomalyquerier.NewEvaluator(settings.ToProviderSettings(), store.querier(), config)
	require.NoError(t, err)
	r, err := NewAnomalyRule("anomaly-1", valuer.GenerateUUID(), rule, store.querier(), evaluator, settings.Logger(), testExternalURL(t))
	require.NoError(t, err)
	return r
}

func testExternalURL(t *testing.T) *url.URL {
	t.Helper()
	u, err := url.Parse("http://localhost:8080")
	require.NoError(t, err)
	return u
}

func anomalyConfig() anomaly.Config {
	return anomaly.Config{MaxConcurrent: 4, MaxSeries: 1000, MaxPoints: 2_000_000}
}

func TestAnomalyRule_FiresWithAUnitlessScore(t *testing.T) {
	store := &anomalyStore{current: steadyThen(100 + 4*anomalyScale), baseline: noisyBaseline}
	rule := newAnomalyTestRule(t, anomalyRuleFromJSON(t), store, anomalyConfig())
	assert.Equal(t, ruletypes.RuleTypeAnomaly, rule.Type())

	found, err := rule.Eval(context.Background(), time.Now())
	require.NoError(t, err)
	assert.Equal(t, 1, found)
	alerts := rule.ActiveAlerts()
	require.Len(t, alerts, 1)
	assert.Equal(t, "4 > 3", alerts[0].Annotations.Get("summary"))
	assert.Empty(t, alerts[0].Annotations.Get(ruletypes.AnnotationAnomalyBaseline))

	// The condition's target and seasonality win over the function's own arguments.
	assert.ElementsMatch(t, []int64{86_400, 172_800, 259_200, 345_600}, store.shifts)
}

func TestAnomalyRule_Operators(t *testing.T) {
	testCases := []struct {
		name  string
		op    string
		last  float64
		fires bool
	}{
		{name: "Above_Spike", op: "1", last: 100 + 4*anomalyScale, fires: true},
		{name: "Above_Dip", op: "1", last: 100 - 4*anomalyScale, fires: false},
		{name: "Below_Dip", op: "below", last: 100 - 4*anomalyScale, fires: true},
		{name: "Below_Spike", op: "2", last: 100 + 4*anomalyScale, fires: false},
		{name: "OutsideBounds_Dip", op: "7", last: 100 - 4*anomalyScale, fires: true},
		{name: "OutsideBounds_Steady", op: "7", last: 100, fires: false},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			store := &anomalyStore{current: steadyThen(testCase.last), baseline: noisyBaseline}
			rule := newAnomalyTestRule(t, anomalyRuleFromJSON(t, `"op": "1"`, `"op": "`+testCase.op+`"`), store, anomalyConfig())
			found, err := rule.Eval(context.Background(), time.Now())
			require.NoError(t, err)
			if testCase.fires {
				assert.Equal(t, 1, found)
			} else {
				assert.Zero(t, found)
			}
		})
	}
}

func TestAnomalyRule_FlatBaselineAnnotation(t *testing.T) {
	store := &anomalyStore{current: []float64{0, 0, 0, 0, 0, 0, 0, 0, 0, 1}, baseline: func(int) []float64 { return make([]float64, 10) }}
	rule := newAnomalyTestRule(t, anomalyRuleFromJSON(t), store, anomalyConfig())

	found, err := rule.Eval(context.Background(), time.Now())
	require.NoError(t, err)
	assert.Equal(t, 1, found)
	alerts := rule.ActiveAlerts()
	require.Len(t, alerts, 1)
	assert.Equal(t, "flat", alerts[0].Annotations.Get(ruletypes.AnnotationAnomalyBaseline))
}

func TestAnomalyRule_InsufficientBaselineNeitherFiresNorReportsNoData(t *testing.T) {
	store := &anomalyStore{current: steadyThen(1000), baseline: func(int) []float64 { return nil }}
	rule := newAnomalyTestRule(t, anomalyRuleFromJSON(t, `"selectedQueryName": "A"`, `"selectedQueryName": "A", "alertOnAbsent": true, "absentFor": 1`), store, anomalyConfig())

	found, err := rule.Eval(context.Background(), time.Now())
	require.NoError(t, err)
	assert.Zero(t, found)
}

func TestAnomalyRule_TimesOut(t *testing.T) {
	store := &anomalyStore{block: true}
	rule := newAnomalyTestRule(t, anomalyRuleFromJSON(t), store, anomalyConfig())
	rule.anomaly.timeout = 20 * time.Millisecond

	start := time.Now()
	_, err := rule.Eval(context.Background(), time.Now())
	require.Error(t, err)
	assert.Less(t, time.Since(start), time.Second)
}

func TestAnomalyRule_WaitsForASlot(t *testing.T) {
	release := make(chan struct{})
	store := &anomalyStore{current: steadyThen(100 + 4*anomalyScale), baseline: noisyBaseline, holdFirst: release}
	config := anomalyConfig()
	config.MaxConcurrent = 1
	settings := instrumentationtest.New()
	evaluator, err := anomalyquerier.NewEvaluator(settings.ToProviderSettings(), store.querier(), config)
	require.NoError(t, err)
	postable := anomalyRuleFromJSON(t)
	rule, err := NewAnomalyRule("anomaly-1", valuer.GenerateUUID(), postable, store.querier(), evaluator, settings.Logger(), testExternalURL(t))
	require.NoError(t, err)

	// A preview holds the only slot until release.
	preview := &qbtypes.QueryRangeRequest{
		Start: 1_700_000_000_000, End: 1_700_000_600_000, RequestType: qbtypes.RequestTypeTimeSeries,
		CompositeQuery: qbtypes.CompositeQuery{Queries: postable.RuleCondition.CompositeQuery.Queries},
	}
	go func() {
		_, _ = evaluator.Evaluate(context.Background(), valuer.GenerateUUID(), preview, anomalyquerier.Options{Admission: anomalyquerier.FailFast})
	}()
	require.Eventually(t, func() bool { return store.callCount() > 0 }, time.Second, time.Millisecond)

	type result struct {
		found int
		err   error
	}
	done := make(chan result, 1)
	go func() {
		found, err := rule.Eval(context.Background(), time.Now())
		done <- result{found, err}
	}()
	select {
	case <-done:
		t.Fatal("the rule did not wait for the slot")
	case <-time.After(50 * time.Millisecond):
	}
	close(release)
	got := <-done
	require.NoError(t, got.err)
	assert.Equal(t, 1, got.found)
}

func TestPrepareTask_AnomalyRule(t *testing.T) {
	am := alertmanagermock.NewMockAlertmanager(t)
	am.On("Config").Return(alertmanagerserver.Config{ExternalURL: testExternalURL(t)})
	store := &anomalyStore{current: steadyThen(100), baseline: noisyBaseline}
	settings := instrumentationtest.New()
	evaluator, err := anomalyquerier.NewEvaluator(settings.ToProviderSettings(), store.querier(), anomalyConfig())
	require.NoError(t, err)

	prepare := func(evaluator *anomalyquerier.Evaluator) (Task, error) {
		return defaultPrepareTaskFunc(PrepareTaskOptions{
			Rule:        anomalyRuleFromJSON(t),
			TaskName:    "anomaly-1-groupname",
			Querier:     store.querier(),
			Logger:      settings.Logger(),
			ManagerOpts: &ManagerOptions{Alertmanager: am, AnomalyEvaluator: evaluator, Logger: settings.Logger()},
			OrgID:       valuer.GenerateUUID(),
		})
	}

	task, err := prepare(evaluator)
	require.NoError(t, err)
	require.Len(t, task.Rules(), 1)
	assert.Equal(t, ruletypes.RuleTypeAnomaly, task.Rules()[0].Type())
	_, isThreshold := task.Rules()[0].(*ThresholdRule)
	assert.True(t, isThreshold, "an anomaly rule must stay a ThresholdRule for task state")

	_, err = prepare(nil)
	assert.Error(t, err)
}
