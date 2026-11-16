package anomalyquerier

import (
	"context"
	"slices"
	"sync"
	"testing"
	"time"

	"github.com/fuseone-io/fusescope/pkg/anomaly"
	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/instrumentation/instrumentationtest"
	"github.com/fuseone-io/fusescope/pkg/querier/queriertest"
	qbtypes "github.com/fuseone-io/fusescope/pkg/types/querybuildertypes/querybuildertypesv5"
	"github.com/fuseone-io/fusescope/pkg/types/telemetrytypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const (
	end    = uint64(1_800_000_000_000)
	window = 30 * time.Minute
)

func labels(service string) []*qbtypes.Label {
	return []*qbtypes.Label{{Key: telemetrytypes.TelemetryFieldKey{Name: "service"}, Value: service}}
}

// timeline is n points a minute apart ending at the window's end, each value from f.
func timeline(service string, n int, f func(i int) float64) *qbtypes.TimeSeries {
	s := &qbtypes.TimeSeries{Labels: labels(service)}
	for i := range n {
		s.Values = append(s.Values, &qbtypes.TimeSeriesValue{Timestamp: int64(end) - int64(n-i)*60_000, Value: f(i)})
	}
	return s
}

func timeSeriesResponse(series ...*qbtypes.TimeSeries) *qbtypes.QueryRangeResponse {
	return &qbtypes.QueryRangeResponse{
		Type: qbtypes.RequestTypeTimeSeries,
		Data: qbtypes.QueryData{Results: []any{&qbtypes.TimeSeriesData{QueryName: "A", Aggregations: []*qbtypes.AggregationBucket{{Series: series}}}}},
		Meta: qbtypes.ExecStats{RowsScanned: 10},
	}
}

func anomalyRequest(extra ...qbtypes.QueryEnvelope) *qbtypes.QueryRangeRequest {
	target := qbtypes.QueryEnvelope{Type: qbtypes.QueryTypeBuilder, Spec: qbtypes.QueryBuilderQuery[qbtypes.MetricAggregation]{
		Name:         "A",
		Signal:       telemetrytypes.SignalMetrics,
		Aggregations: []qbtypes.MetricAggregation{{MetricName: "http.server.requests"}},
		Functions: []qbtypes.Function{
			{Name: qbtypes.FunctionNameEWMA3},
			{Name: qbtypes.FunctionNameAnomaly, Args: []qbtypes.FunctionArg{{Name: "z_score_threshold", Value: 3}, {Name: "seasonality", Value: "daily"}}},
		},
	}}
	return &qbtypes.QueryRangeRequest{
		Start:          end - uint64(window.Milliseconds()),
		End:            end,
		RequestType:    qbtypes.RequestTypeTimeSeries,
		CompositeQuery: qbtypes.CompositeQuery{Queries: append([]qbtypes.QueryEnvelope{target}, extra...)},
	}
}

func auxQuery() qbtypes.QueryEnvelope {
	return qbtypes.QueryEnvelope{Type: qbtypes.QueryTypeBuilder, Spec: qbtypes.QueryBuilderQuery[qbtypes.MetricAggregation]{
		Name: "B", Signal: telemetrytypes.SignalMetrics, Limit: 5,
		Aggregations: []qbtypes.MetricAggregation{{MetricName: "http.server.errors"}},
	}}
}

// fakeStore answers the current call from current and every baseline call with baseline(shift).
type fakeStore struct {
	mu       sync.Mutex
	calls    []*qbtypes.QueryRangeRequest
	current  func() *qbtypes.QueryRangeResponse
	baseline func(ctx context.Context, shift int64) (*qbtypes.QueryRangeResponse, error)
}

func (f *fakeStore) querier() *queriertest.MockQuerier {
	mock := queriertest.NewMockQuerier()
	mock.QueryRangeFunc = func(ctx context.Context, _ valuer.UUID, req *qbtypes.QueryRangeRequest) (*qbtypes.QueryRangeResponse, error) {
		f.mu.Lock()
		f.calls = append(f.calls, req)
		f.mu.Unlock()
		spec := req.CompositeQuery.Queries[0].Spec.(qbtypes.QueryBuilderQuery[qbtypes.MetricAggregation])
		for _, fn := range spec.Functions {
			if fn.Name == qbtypes.FunctionNameTimeShift {
				shift, err := qbtypes.ParseFunctionArgNumber(fn.Args[0].Value)
				if err != nil {
					return nil, err
				}
				return f.baseline(ctx, int64(shift))
			}
		}
		return f.current(), nil
	}
	return mock
}

func (f *fakeStore) baselineCalls() []*qbtypes.QueryRangeRequest {
	f.mu.Lock()
	defer f.mu.Unlock()
	if len(f.calls) < 2 {
		return nil
	}
	return slices.Clone(f.calls[1:])
}

func newEvaluator(t *testing.T, store *fakeStore, config anomaly.Config) *Evaluator {
	evaluator, err := NewEvaluator(instrumentationtest.New().ToProviderSettings(), store.querier(), config)
	require.NoError(t, err)
	return evaluator
}

func defaultConfig() anomaly.Config {
	return anomaly.Config{MaxConcurrent: 4, MaxSeries: 1000, MaxPoints: 2_000_000}
}

// Seasons sit on the current timeline, as the querier returns them after timeShift.
func steadyStore() *fakeStore {
	return &fakeStore{
		current: func() *qbtypes.QueryRangeResponse {
			return timeSeriesResponse(timeline("api", 30, func(i int) float64 {
				if i == 29 {
					return 400
				}
				return 100 + float64(i)
			}))
		},
		baseline: func(_ context.Context, shift int64) (*qbtypes.QueryRangeResponse, error) {
			offset := float64(shift/86_400) - 2.5
			return timeSeriesResponse(timeline("api", 30, func(i int) float64 { return 100 + float64(i) + offset })), nil
		},
	}
}

func TestEvaluate_RunsTheTargetAloneInFourShiftedBaselines(t *testing.T) {
	store := steadyStore()
	original := anomalyRequest(auxQuery())
	store.current = func() *qbtypes.QueryRangeResponse {
		resp := steadyStore().current()
		resp.Data.Results = append(resp.Data.Results, &qbtypes.TimeSeriesData{QueryName: "B", Aggregations: []*qbtypes.AggregationBucket{{Series: []*qbtypes.TimeSeries{timeline("api", 30, func(int) float64 { return 1 })}}}})
		return resp
	}

	evaluation, err := newEvaluator(t, store, defaultConfig()).Evaluate(context.Background(), valuer.GenerateUUID(), original, Options{Admission: FailFast})
	require.NoError(t, err)

	require.Len(t, store.calls, 5)
	current := store.calls[0]
	assert.True(t, current.NoCache)
	require.Len(t, current.CompositeQuery.Queries, 2)
	currentSpec := current.CompositeQuery.Queries[0].Spec.(qbtypes.QueryBuilderQuery[qbtypes.MetricAggregation])
	assert.Equal(t, []qbtypes.Function{{Name: qbtypes.FunctionNameEWMA3}}, currentSpec.Functions)
	step := currentSpec.StepInterval.Duration
	assert.NotZero(t, step)
	assert.Zero(t, (24*time.Hour)%step)

	shifts := map[int64]bool{}
	for _, call := range store.baselineCalls() {
		assert.False(t, call.NoCache)
		require.Len(t, call.CompositeQuery.Queries, 1)
		spec := call.CompositeQuery.Queries[0].Spec.(qbtypes.QueryBuilderQuery[qbtypes.MetricAggregation])
		assert.Equal(t, "A", spec.Name)
		assert.Equal(t, step, spec.StepInterval.Duration)
		require.Len(t, spec.Functions, 2)
		assert.Equal(t, qbtypes.FunctionNameEWMA3, spec.Functions[0].Name)
		assert.Equal(t, qbtypes.FunctionNameTimeShift, spec.Functions[1].Name)
		shift, err := qbtypes.ParseFunctionArgNumber(spec.Functions[1].Args[0].Value)
		require.NoError(t, err)
		shifts[int64(shift)] = true
	}
	assert.Equal(t, map[int64]bool{86_400: true, 172_800: true, 259_200: true, 345_600: true}, shifts)

	results := evaluation.Response.Data.Results
	require.Len(t, results, 2)
	target := results[0].(*qbtypes.TimeSeriesData).Aggregations[0]
	require.Len(t, target.PredictedSeries, 1)
	require.Len(t, target.AnomalyScores, 1)
	assert.Equal(t, target.Series[0].Labels, target.PredictedSeries[0].Labels)
	last := target.AnomalyScores[0].Values[len(target.AnomalyScores[0].Values)-1]
	assert.Greater(t, last.Value, 3.0)
	aux := results[1].(*qbtypes.TimeSeriesData).Aggregations[0]
	assert.Nil(t, aux.PredictedSeries)
	assert.Nil(t, aux.AnomalyScores)
	assert.Equal(t, 30, evaluation.Outcomes[anomaly.ReasonScored])

	originalSpec := original.CompositeQuery.Queries[0].Spec.(qbtypes.QueryBuilderQuery[qbtypes.MetricAggregation])
	assert.Len(t, originalSpec.Functions, 2)
	assert.Zero(t, originalSpec.StepInterval.Duration)
	assert.False(t, original.NoCache)
}

func TestEvaluate_AlignsBaselinesByTimestamp(t *testing.T) {
	store := steadyStore()
	evaluation, err := newEvaluator(t, store, defaultConfig()).Evaluate(context.Background(), valuer.GenerateUUID(), anomalyRequest(), Options{Admission: FailFast})
	require.NoError(t, err)
	target := evaluation.Response.Data.Results[0].(*qbtypes.TimeSeriesData).Aggregations[0]
	first := target.PredictedSeries[0].Values[0]
	assert.Equal(t, target.Series[0].Values[0].Timestamp, first.Timestamp)
	// The four seasons are 98.5, 99.5, 100.5 and 101.5 above the ramp: their median is 100.
	assert.InDelta(t, 100, first.Value, 1e-9)
}

func TestEvaluate_PreflightLimitRunsNoBaseline(t *testing.T) {
	store := steadyStore()
	config := defaultConfig()
	config.MaxPoints = 100

	_, err := newEvaluator(t, store, config).Evaluate(context.Background(), valuer.GenerateUUID(), anomalyRequest(), Options{Admission: FailFast})
	require.Error(t, err)
	assert.True(t, errors.Ast(err, errors.TypePayloadTooLarge))
	assert.Len(t, store.calls, 1)
}

func TestEvaluate_CurrentWindowLimit(t *testing.T) {
	store := steadyStore()
	config := defaultConfig()
	config.MaxPoints = 10

	_, err := newEvaluator(t, store, config).Evaluate(context.Background(), valuer.GenerateUUID(), anomalyRequest(), Options{Admission: FailFast})
	require.Error(t, err)
	assert.True(t, errors.Ast(err, errors.TypePayloadTooLarge))
	assert.Len(t, store.calls, 1)
}

func TestEvaluate_HistoryLimitCancelsTheOtherBaselines(t *testing.T) {
	store := steadyStore()
	var cancelled sync.WaitGroup
	cancelled.Add(3)
	store.baseline = func(ctx context.Context, shift int64) (*qbtypes.QueryRangeResponse, error) {
		if shift == 86_400 {
			var many []*qbtypes.TimeSeries
			for i := range 3 {
				many = append(many, timeline(string(rune('a'+i)), 30, func(int) float64 { return 1 }))
			}
			return timeSeriesResponse(many...), nil
		}
		<-ctx.Done()
		cancelled.Done()
		return nil, ctx.Err()
	}
	config := defaultConfig()
	config.MaxSeries = 2

	_, err := newEvaluator(t, store, config).Evaluate(context.Background(), valuer.GenerateUUID(), anomalyRequest(), Options{Admission: FailFast})
	require.Error(t, err)
	assert.True(t, errors.Ast(err, errors.TypePayloadTooLarge))
	cancelled.Wait()
}

func TestEvaluate_NoEligiblePointRunsNoBaseline(t *testing.T) {
	store := steadyStore()
	store.current = func() *qbtypes.QueryRangeResponse {
		s := timeline("api", 2, func(int) float64 { return 1 })
		s.Values[0].Partial, s.Values[1].Partial = true, true
		return timeSeriesResponse(s)
	}

	evaluation, err := newEvaluator(t, store, defaultConfig()).Evaluate(context.Background(), valuer.GenerateUUID(), anomalyRequest(), Options{Admission: FailFast})
	require.NoError(t, err)
	assert.Len(t, store.calls, 1)
	assert.Equal(t, map[anomaly.Reason]int{anomaly.ReasonPartial: 2}, evaluation.Outcomes)
}

func TestEvaluate_NoSeriesRunsNoBaseline(t *testing.T) {
	store := steadyStore()
	store.current = func() *qbtypes.QueryRangeResponse { return timeSeriesResponse() }

	evaluation, err := newEvaluator(t, store, defaultConfig()).Evaluate(context.Background(), valuer.GenerateUUID(), anomalyRequest(), Options{Admission: FailFast})
	require.NoError(t, err)
	assert.Len(t, store.calls, 1)
	assert.Empty(t, evaluation.Outcomes)
}

func TestEvaluate_Admission(t *testing.T) {
	release := make(chan struct{})
	store := steadyStore()
	store.baseline = func(ctx context.Context, shift int64) (*qbtypes.QueryRangeResponse, error) {
		<-release
		return steadyStore().baseline(ctx, shift)
	}
	config := defaultConfig()
	config.MaxConcurrent = 1
	evaluator := newEvaluator(t, store, config)

	done := make(chan error, 1)
	go func() {
		_, err := evaluator.Evaluate(context.Background(), valuer.GenerateUUID(), anomalyRequest(), Options{Admission: FailFast})
		done <- err
	}()
	require.Eventually(t, func() bool { return len(store.baselineCalls()) > 0 }, time.Second, time.Millisecond)

	_, err := evaluator.Evaluate(context.Background(), valuer.GenerateUUID(), anomalyRequest(), Options{Admission: FailFast})
	assert.True(t, errors.Ast(err, errors.TypeTooManyRequests))

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Millisecond)
	defer cancel()
	_, err = evaluator.Evaluate(ctx, valuer.GenerateUUID(), anomalyRequest(), Options{Admission: Wait})
	assert.ErrorIs(t, err, context.DeadlineExceeded)

	close(release)
	assert.NoError(t, <-done)
}

func TestEvaluate_RefusesAnInvalidRequest(t *testing.T) {
	req := anomalyRequest()
	req.FormatOptions = &qbtypes.FormatOptions{FillGaps: true}
	store := steadyStore()

	_, err := newEvaluator(t, store, defaultConfig()).Evaluate(context.Background(), valuer.GenerateUUID(), req, Options{Admission: FailFast})
	assert.True(t, errors.Ast(err, errors.TypeInvalidInput))
	assert.Empty(t, store.calls)
}

func TestQuerier_DelegatesRequestsWithoutAnomaly(t *testing.T) {
	store := steadyStore()
	evaluator := newEvaluator(t, store, defaultConfig())
	decorated := NewQuerier(store.querier(), evaluator)

	plain := anomalyRequest()
	spec := plain.CompositeQuery.Queries[0].Spec.(qbtypes.QueryBuilderQuery[qbtypes.MetricAggregation])
	spec.Functions = nil
	plain.CompositeQuery.Queries[0].Spec = spec
	_, err := decorated.QueryRange(context.Background(), valuer.GenerateUUID(), plain)
	require.NoError(t, err)
	require.Len(t, store.calls, 1)
	assert.Same(t, plain, store.calls[0])

	resp, err := decorated.QueryRange(context.Background(), valuer.GenerateUUID(), anomalyRequest())
	require.NoError(t, err)
	assert.Len(t, store.calls, 6)
	assert.NotNil(t, resp.Data.Results[0].(*qbtypes.TimeSeriesData).Aggregations[0].PredictedSeries)
}

// The querier resolves metadata in place, as the real one does with metric aggregations.
func mutatingQuerier(store *fakeStore) *queriertest.MockQuerier {
	mock := store.querier()
	answer := mock.QueryRangeFunc
	mock.QueryRangeFunc = func(ctx context.Context, orgID valuer.UUID, req *qbtypes.QueryRangeRequest) (*qbtypes.QueryRangeResponse, error) {
		for _, envelope := range req.CompositeQuery.Queries {
			if spec, ok := envelope.Spec.(qbtypes.QueryBuilderQuery[qbtypes.MetricAggregation]); ok {
				spec.Aggregations[0].MetricName = "resolved"
			}
		}
		req.Start, req.End = 1, 2
		return answer(ctx, orgID, req)
	}
	return mock
}

func TestEvaluate_LeavesEveryQueryOfTheCallerUntouched(t *testing.T) {
	store := steadyStore()
	original := anomalyRequest(auxQuery())
	want := anomalyRequest(auxQuery())
	evaluator, err := NewEvaluator(instrumentationtest.New().ToProviderSettings(), mutatingQuerier(store), defaultConfig())
	require.NoError(t, err)

	_, err = evaluator.Evaluate(context.Background(), valuer.GenerateUUID(), original, Options{Admission: FailFast})
	require.NoError(t, err)
	assert.Equal(t, want, original)
}

func TestEvaluate_NormalizesTheWindowForEveryCall(t *testing.T) {
	store := steadyStore()
	req := anomalyRequest()
	req.Start, req.End = req.Start/1_000, req.End/1_000

	_, err := newEvaluator(t, store, defaultConfig()).Evaluate(context.Background(), valuer.GenerateUUID(), req, Options{Admission: FailFast})
	require.NoError(t, err)
	require.Len(t, store.calls, 5)
	for _, call := range store.calls {
		assert.Equal(t, end-uint64(window.Milliseconds()), call.Start)
		assert.Equal(t, end, call.End)
	}
}

func TestEvaluate_MergesBaselineStatsAndWarnings(t *testing.T) {
	store := steadyStore()
	store.current = func() *qbtypes.QueryRangeResponse {
		resp := steadyStore().current()
		resp.Meta = qbtypes.ExecStats{RowsScanned: 10, BytesScanned: 100, DurationMS: 5}
		resp.Warning = &qbtypes.QueryWarnData{Message: "partial data", Warnings: []qbtypes.QueryWarnDataAdditional{{Message: "metric is delayed"}}}
		return resp
	}
	baseline := store.baseline
	store.baseline = func(ctx context.Context, shift int64) (*qbtypes.QueryRangeResponse, error) {
		resp, err := baseline(ctx, shift)
		if err != nil {
			return nil, err
		}
		resp.Meta = qbtypes.ExecStats{RowsScanned: 1, BytesScanned: 10, DurationMS: 2}
		resp.Warning = &qbtypes.QueryWarnData{Message: "partial data", Warnings: []qbtypes.QueryWarnDataAdditional{{Message: "metric is delayed"}, {Message: "season has gaps"}}}
		return resp, nil
	}

	evaluation, err := newEvaluator(t, store, defaultConfig()).Evaluate(context.Background(), valuer.GenerateUUID(), anomalyRequest(), Options{Admission: FailFast})
	require.NoError(t, err)
	meta := evaluation.Response.Meta
	assert.Equal(t, uint64(14), meta.RowsScanned)
	assert.Equal(t, uint64(140), meta.BytesScanned)
	assert.Equal(t, uint64(13), meta.DurationMS)
	require.NotNil(t, evaluation.Response.Warning)
	assert.Equal(t, "partial data", evaluation.Response.Warning.Message)
	assert.Equal(t, []qbtypes.QueryWarnDataAdditional{{Message: "metric is delayed"}, {Message: "season has gaps"}}, evaluation.Response.Warning.Warnings)
}

func TestEvaluate_TakesBaselineWarningsWhenTheCurrentWindowHasNone(t *testing.T) {
	store := steadyStore()
	baseline := store.baseline
	store.baseline = func(ctx context.Context, shift int64) (*qbtypes.QueryRangeResponse, error) {
		resp, err := baseline(ctx, shift)
		if err != nil {
			return nil, err
		}
		resp.Warning = &qbtypes.QueryWarnData{Message: "partial data", Warnings: []qbtypes.QueryWarnDataAdditional{{Message: "season has gaps"}}}
		return resp, nil
	}

	evaluation, err := newEvaluator(t, store, defaultConfig()).Evaluate(context.Background(), valuer.GenerateUUID(), anomalyRequest(), Options{Admission: FailFast})
	require.NoError(t, err)
	require.NotNil(t, evaluation.Response.Warning)
	assert.Equal(t, []qbtypes.QueryWarnDataAdditional{{Message: "season has gaps"}}, evaluation.Response.Warning.Warnings)
}
