package anomalyquerier

import (
	"context"
	"fmt"
	"sync/atomic"
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
	sdkmetric "go.opentelemetry.io/otel/sdk/metric"
	"go.opentelemetry.io/otel/sdk/metric/metricdata"
)

// cohortRequest is the RED cohort query: three trace aggregations grouped by service.
func cohortRequest(functions ...qbtypes.Function) *qbtypes.QueryRangeRequest {
	return &qbtypes.QueryRangeRequest{
		Start:       end - uint64((15 * time.Minute).Milliseconds()),
		End:         end,
		RequestType: qbtypes.RequestTypeTimeSeries,
		CompositeQuery: qbtypes.CompositeQuery{Queries: []qbtypes.QueryEnvelope{{Type: qbtypes.QueryTypeBuilder, Spec: qbtypes.QueryBuilderQuery[qbtypes.TraceAggregation]{
			Name:         "A",
			Signal:       telemetrytypes.SignalTraces,
			StepInterval: qbtypes.Step{Duration: 5 * time.Minute},
			Aggregations: []qbtypes.TraceAggregation{{Expression: "count()"}, {Expression: "countIf(status_code = 2)"}, {Expression: "p99(duration_nano)"}},
			GroupBy:      []qbtypes.GroupByKey{{TelemetryFieldKey: telemetrytypes.TelemetryFieldKey{Name: "service.name"}}},
			Functions:    functions,
		}}}},
	}
}

// cohortResponse has every service in each of the three aggregations, points a minute apart.
func cohortResponse(services, points int) *qbtypes.QueryRangeResponse {
	buckets := make([]*qbtypes.AggregationBucket, 3)
	for i := range buckets {
		buckets[i] = &qbtypes.AggregationBucket{Index: i}
		for s := range services {
			buckets[i].Series = append(buckets[i].Series, timeline(fmt.Sprintf("svc-%d", s), points, func(int) float64 { return 1 }))
		}
	}
	return &qbtypes.QueryRangeResponse{
		Type: qbtypes.RequestTypeTimeSeries,
		Data: qbtypes.QueryData{Results: []any{&qbtypes.TimeSeriesData{QueryName: "A", Aggregations: buckets}}},
	}
}

// sessionEvaluator answers every query range call with respond and counts the calls.
func sessionEvaluator(t *testing.T, config anomaly.Config, respond func(req *qbtypes.QueryRangeRequest) *qbtypes.QueryRangeResponse) (*Evaluator, *atomic.Int32) {
	calls := &atomic.Int32{}
	mock := queriertest.NewMockQuerier()
	mock.QueryRangeFunc = func(_ context.Context, _ valuer.UUID, req *qbtypes.QueryRangeRequest) (*qbtypes.QueryRangeResponse, error) {
		calls.Add(1)
		return respond(req), nil
	}
	evaluator, err := NewEvaluator(instrumentationtest.New().ToProviderSettings(), mock, config)
	require.NoError(t, err)
	return evaluator, calls
}

func oneSlot() anomaly.Config {
	config := defaultConfig()
	config.MaxConcurrent = 1
	return config
}

func TestAdmit_FailFastRefusesWhileEverySlotIsTaken(t *testing.T) {
	evaluator, _ := sessionEvaluator(t, oneSlot(), func(*qbtypes.QueryRangeRequest) *qbtypes.QueryRangeResponse { return cohortResponse(1, 1) })
	session, err := evaluator.Admit(context.Background(), FailFast)
	require.NoError(t, err)

	_, err = evaluator.Admit(context.Background(), FailFast)
	assert.True(t, errors.Ast(err, errors.TypeTooManyRequests))

	session.Close()
	next, err := evaluator.Admit(context.Background(), FailFast)
	require.NoError(t, err)
	next.Close()
}

func TestAdmit_WaitBlocksUntilClose(t *testing.T) {
	evaluator, _ := sessionEvaluator(t, oneSlot(), func(*qbtypes.QueryRangeRequest) *qbtypes.QueryRangeResponse { return cohortResponse(1, 1) })
	session, err := evaluator.Admit(context.Background(), Wait)
	require.NoError(t, err)

	admitted := make(chan *Session, 1)
	go func() {
		s, err := evaluator.Admit(context.Background(), Wait)
		assert.NoError(t, err)
		admitted <- s
	}()
	select {
	case <-admitted:
		t.Fatal("a second session was admitted while the only slot was taken")
	case <-time.After(20 * time.Millisecond):
	}

	session.Close()
	select {
	case s := <-admitted:
		s.Close()
	case <-time.After(time.Second):
		t.Fatal("the waiting session was not admitted after Close")
	}
}

func TestAdmit_WaitStopsWithTheContext(t *testing.T) {
	evaluator, _ := sessionEvaluator(t, oneSlot(), func(*qbtypes.QueryRangeRequest) *qbtypes.QueryRangeResponse { return cohortResponse(1, 1) })
	session, err := evaluator.Admit(context.Background(), Wait)
	require.NoError(t, err)
	defer session.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Millisecond)
	defer cancel()
	_, err = evaluator.Admit(ctx, Wait)
	assert.ErrorIs(t, err, context.DeadlineExceeded)
}

func TestSession_CloseReleasesItsSlotOnce(t *testing.T) {
	config := defaultConfig()
	config.MaxConcurrent = 2
	evaluator, _ := sessionEvaluator(t, config, func(*qbtypes.QueryRangeRequest) *qbtypes.QueryRangeResponse { return cohortResponse(1, 1) })
	first, err := evaluator.Admit(context.Background(), FailFast)
	require.NoError(t, err)
	second, err := evaluator.Admit(context.Background(), FailFast)
	require.NoError(t, err)
	defer second.Close()

	first.Close()
	first.Close()

	third, err := evaluator.Admit(context.Background(), FailFast)
	require.NoError(t, err)
	defer third.Close()
	_, err = evaluator.Admit(context.Background(), FailFast)
	assert.True(t, errors.Ast(err, errors.TypeTooManyRequests))
}

func TestAdmit_SharesSlotsWithEvaluate(t *testing.T) {
	release := make(chan struct{})
	store := steadyStore()
	store.baseline = func(ctx context.Context, shift int64) (*qbtypes.QueryRangeResponse, error) {
		<-release
		return steadyStore().baseline(ctx, shift)
	}
	evaluator := newEvaluator(t, store, oneSlot())

	session, err := evaluator.Admit(context.Background(), FailFast)
	require.NoError(t, err)
	_, err = evaluator.Evaluate(context.Background(), valuer.GenerateUUID(), anomalyRequest(), Options{Admission: FailFast})
	assert.True(t, errors.Ast(err, errors.TypeTooManyRequests))
	session.Close()

	done := make(chan error, 1)
	go func() {
		_, err := evaluator.Evaluate(context.Background(), valuer.GenerateUUID(), anomalyRequest(), Options{Admission: FailFast})
		done <- err
	}()
	require.Eventually(t, func() bool { return len(store.baselineCalls()) > 0 }, time.Second, time.Millisecond)
	_, err = evaluator.Admit(context.Background(), FailFast)
	assert.True(t, errors.Ast(err, errors.TypeTooManyRequests))

	close(release)
	assert.NoError(t, <-done)
}

func TestSession_RunLimitsTheLabelSetsOfEachResponse(t *testing.T) {
	testCases := []struct {
		name     string
		response *qbtypes.QueryRangeResponse
		exceeded bool
	}{
		{name: "TimeSeries_AtTheLimit_CountsEachServiceOnce", response: cohortResponse(5, 3)},
		{name: "TimeSeries_AboveTheLimit", response: cohortResponse(6, 3), exceeded: true},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			config := defaultConfig()
			config.MaxSeries = 5
			evaluator, _ := sessionEvaluator(t, config, func(*qbtypes.QueryRangeRequest) *qbtypes.QueryRangeResponse { return testCase.response })
			session, err := evaluator.Admit(context.Background(), FailFast)
			require.NoError(t, err)
			defer session.Close()

			resp, err := session.Run(context.Background(), valuer.GenerateUUID(), cohortRequest())
			if testCase.exceeded {
				assert.True(t, errors.Ast(err, errors.TypePayloadTooLarge))
				assert.True(t, errors.Asc(err, ErrCodeLimitExceeded))
				assert.Nil(t, resp)
				return
			}
			require.NoError(t, err)
			assert.Same(t, testCase.response, resp)
		})
	}
}

func TestSession_RunCountsPointsAcrossTheSession(t *testing.T) {
	config := defaultConfig()
	config.MaxPoints = 100
	// 2 services × 3 aggregations × 10 points = 60 points a response.
	evaluator, calls := sessionEvaluator(t, config, func(*qbtypes.QueryRangeRequest) *qbtypes.QueryRangeResponse { return cohortResponse(2, 10) })
	session, err := evaluator.Admit(context.Background(), Wait)
	require.NoError(t, err)
	defer session.Close()
	org := valuer.GenerateUUID()

	_, err = session.Run(context.Background(), org, cohortRequest())
	require.NoError(t, err)

	_, err = session.Run(context.Background(), org, cohortRequest())
	assert.True(t, errors.Ast(err, errors.TypePayloadTooLarge))
	assert.True(t, errors.Asc(err, ErrCodeLimitExceeded))

	_, err = session.Run(context.Background(), org, cohortRequest())
	assert.True(t, errors.Ast(err, errors.TypePayloadTooLarge))
	assert.Equal(t, int32(2), calls.Load(), "a session past its limit queries nothing more")
}

func TestSession_RunRefusesEveryRequestAfterTooManySeries(t *testing.T) {
	config := defaultConfig()
	config.MaxSeries = 5
	evaluator, calls := sessionEvaluator(t, config, func(*qbtypes.QueryRangeRequest) *qbtypes.QueryRangeResponse { return cohortResponse(6, 1) })
	session, err := evaluator.Admit(context.Background(), Wait)
	require.NoError(t, err)
	defer session.Close()
	org := valuer.GenerateUUID()

	for range 2 {
		_, err = session.Run(context.Background(), org, cohortRequest())
		assert.True(t, errors.Ast(err, errors.TypePayloadTooLarge))
		assert.True(t, errors.Asc(err, ErrCodeLimitExceeded))
	}
	assert.Equal(t, int32(1), calls.Load(), "a session past its limit queries nothing more")
}

func TestSession_RunPassesACopyOfTheRequestToTheWrappedQuerier(t *testing.T) {
	timeShift := qbtypes.Function{Name: qbtypes.FunctionNameTimeShift, Args: []qbtypes.FunctionArg{{Value: int64(86_400)}}}
	newRequest := func() *qbtypes.QueryRangeRequest {
		req := cohortRequest(timeShift)
		req.Variables = map[string]qbtypes.VariableItem{"env": {Type: qbtypes.QueryVariableType, Value: "prod"}}
		req.FormatOptions = &qbtypes.FormatOptions{FormatTableResultForUI: true}
		return req
	}
	want := cohortResponse(1, 3)
	var got *qbtypes.QueryRangeRequest
	evaluator, calls := sessionEvaluator(t, defaultConfig(), func(req *qbtypes.QueryRangeRequest) *qbtypes.QueryRangeResponse {
		got = req
		spec := req.CompositeQuery.Queries[0].Spec.(qbtypes.QueryBuilderQuery[qbtypes.TraceAggregation])
		spec.Aggregations[0].Expression = "resolved"
		spec.Functions[0].Args[0].Value = int64(1)
		req.CompositeQuery.Queries[0].Spec = spec
		req.Variables["env"] = qbtypes.VariableItem{Value: "mutated"}
		req.FormatOptions.FormatTableResultForUI = false
		req.Start, req.End = 1, 2
		return want
	})
	session, err := evaluator.Admit(context.Background(), FailFast)
	require.NoError(t, err)
	defer session.Close()

	req := newRequest()
	resp, err := session.Run(context.Background(), valuer.GenerateUUID(), req)
	require.NoError(t, err)
	assert.Same(t, want, resp)
	assert.Equal(t, int32(1), calls.Load())
	assert.NotSame(t, req, got)
	assert.Equal(t, newRequest(), req, "the querier's mutations stay on its copy")
}

func TestSession_RunRefuses(t *testing.T) {
	anomalyFn := qbtypes.Function{Name: qbtypes.FunctionNameAnomaly, Args: []qbtypes.FunctionArg{{Value: 3}}}
	raw := cohortRequest()
	raw.RequestType = qbtypes.RequestTypeRaw
	scalar := cohortRequest()
	scalar.RequestType = qbtypes.RequestTypeScalar
	testCases := []struct {
		name   string
		req    *qbtypes.QueryRangeRequest
		closed bool
	}{
		{name: "AnomalyFunction", req: cohortRequest(anomalyFn)},
		{name: "RawRequest", req: raw},
		{name: "ScalarRequest", req: scalar},
		{name: "ClosedSession", req: cohortRequest(), closed: true},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			evaluator, calls := sessionEvaluator(t, defaultConfig(), func(*qbtypes.QueryRangeRequest) *qbtypes.QueryRangeResponse { return cohortResponse(1, 1) })
			session, err := evaluator.Admit(context.Background(), FailFast)
			require.NoError(t, err)
			if testCase.closed {
				session.Close()
			}
			defer session.Close()

			_, err = session.Run(context.Background(), valuer.GenerateUUID(), testCase.req)
			require.Error(t, err)
			if testCase.closed {
				assert.True(t, errors.Ast(err, errors.TypeInternal))
			} else {
				assert.True(t, errors.Ast(err, errors.TypeInvalidInput))
			}
			assert.Zero(t, calls.Load())
		})
	}
}

func TestEvaluations_CarryTheirKind(t *testing.T) {
	reader := sdkmetric.NewManualReader()
	settings := instrumentationtest.New().ToProviderSettings()
	settings.MeterProvider = sdkmetric.NewMeterProvider(sdkmetric.WithReader(reader))
	evaluator, err := NewEvaluator(settings, steadyStore().querier(), defaultConfig())
	require.NoError(t, err)
	ctx := context.Background()

	_, err = evaluator.Evaluate(ctx, valuer.GenerateUUID(), anomalyRequest(), Options{Admission: FailFast})
	require.NoError(t, err)
	session, err := evaluator.Admit(ctx, FailFast)
	require.NoError(t, err)
	_, err = session.Run(ctx, valuer.GenerateUUID(), cohortRequest(qbtypes.Function{Name: qbtypes.FunctionNameAnomaly}))
	require.Error(t, err)
	session.Close()

	var collected metricdata.ResourceMetrics
	require.NoError(t, reader.Collect(ctx, &collected))
	kinds := map[string]int64{}
	for _, scope := range collected.ScopeMetrics {
		for _, m := range scope.Metrics {
			if m.Name != "fusescope.anomaly.evaluations" {
				continue
			}
			for _, point := range m.Data.(metricdata.Sum[int64]).DataPoints {
				kind, _ := point.Attributes.Value("kind")
				kinds[kind.AsString()] += point.Value
			}
		}
	}
	assert.Equal(t, map[string]int64{"evaluate": 1, "session": 1}, kinds)
}
