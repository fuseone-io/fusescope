package anomaly

import (
	"testing"
	"time"

	qbtypes "github.com/fuseone-io/fusescope/pkg/types/querybuildertypes/querybuildertypesv5"
	"github.com/fuseone-io/fusescope/pkg/types/telemetrytypes"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func anomalyFn(args ...qbtypes.FunctionArg) qbtypes.Function {
	return qbtypes.Function{Name: qbtypes.FunctionNameAnomaly, Args: args}
}

func named(name string, value any) qbtypes.FunctionArg {
	return qbtypes.FunctionArg{Name: name, Value: value}
}

func positional(value any) qbtypes.FunctionArg { return qbtypes.FunctionArg{Value: value} }

func TestParseArgs(t *testing.T) {
	testCases := []struct {
		name    string
		fn      qbtypes.Function
		want    Args
		wantErr bool
	}{
		{name: "Named", fn: anomalyFn(named("z_score_threshold", 3), named("seasonality", "daily")), want: Args{Target: 3, Seasonality: SeasonalityDaily}},
		{name: "Positional", fn: anomalyFn(positional(2.5), positional("weekly")), want: Args{Target: 2.5, Seasonality: SeasonalityWeekly}},
		{name: "PositionalStringNumber", fn: anomalyFn(positional("4")), want: Args{Target: 4, Seasonality: SeasonalityHourly}},
		{name: "DefaultSeasonalityHourly", fn: anomalyFn(named("z_score_threshold", 3)), want: Args{Target: 3, Seasonality: SeasonalityHourly}},
		{name: "NamedAndPositionalAgree", fn: anomalyFn(positional(3), named("z_score_threshold", 3)), want: Args{Target: 3, Seasonality: SeasonalityHourly}},
		{name: "NamedAndPositionalConflict", fn: anomalyFn(positional(3), named("z_score_threshold", 4)), wantErr: true},
		{name: "DuplicateNamed", fn: anomalyFn(named("seasonality", "daily"), named("seasonality", "daily"), named("z_score_threshold", 3)), wantErr: true},
		{name: "UnknownName", fn: anomalyFn(named("z_score_threshold", 3), named("algorithm", "standard")), wantErr: true},
		{name: "TooManyPositional", fn: anomalyFn(positional(3), positional("daily"), positional(1)), wantErr: true},
		{name: "MissingTarget", fn: anomalyFn(named("seasonality", "daily")), wantErr: true},
		{name: "TargetBelowOne", fn: anomalyFn(positional(0.5)), wantErr: true},
		{name: "TargetAboveSeven", fn: anomalyFn(positional(8)), wantErr: true},
		{name: "TargetNotANumber", fn: anomalyFn(positional("high")), wantErr: true},
		{name: "UnknownSeasonality", fn: anomalyFn(positional(3), positional("monthly")), wantErr: true},
		{name: "SeasonalityNotAString", fn: anomalyFn(positional(3), positional(7)), wantErr: true},
		{name: "ObjectValueAgreesWithNumber", fn: anomalyFn(positional(map[string]any{"value": 3}), named("z_score_threshold", 3)), want: Args{Target: 3, Seasonality: SeasonalityHourly}},
		{name: "ObjectSeasonalityConflict_NoPanic", fn: anomalyFn(positional(3), positional(map[string]any{"value": "daily"}), named("seasonality", "daily")), wantErr: true},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			got, err := ParseArgs(testCase.fn)
			if testCase.wantErr {
				assert.Error(t, err)
				return
			}
			require.NoError(t, err)
			assert.Equal(t, testCase.want, got)
		})
	}
}

func metricsQuery(mutate func(*qbtypes.QueryBuilderQuery[qbtypes.MetricAggregation])) qbtypes.QueryEnvelope {
	spec := qbtypes.QueryBuilderQuery[qbtypes.MetricAggregation]{
		Name:         "A",
		Signal:       telemetrytypes.SignalMetrics,
		Aggregations: []qbtypes.MetricAggregation{{MetricName: "http.server.requests"}},
		Functions:    []qbtypes.Function{anomalyFn(named("z_score_threshold", 3), named("seasonality", "daily"))},
	}
	if mutate != nil {
		mutate(&spec)
	}
	return qbtypes.QueryEnvelope{Type: qbtypes.QueryTypeBuilder, Spec: spec}
}

func request(window time.Duration, queries ...qbtypes.QueryEnvelope) *qbtypes.QueryRangeRequest {
	end := uint64(1_800_000_000_000)
	return &qbtypes.QueryRangeRequest{
		Start:          end - uint64(window.Milliseconds()),
		End:            end,
		RequestType:    qbtypes.RequestTypeTimeSeries,
		CompositeQuery: qbtypes.CompositeQuery{Queries: queries},
	}
}

func TestFindTarget_NoAnomaly(t *testing.T) {
	target, found, err := FindTarget(request(time.Hour, metricsQuery(func(s *qbtypes.QueryBuilderQuery[qbtypes.MetricAggregation]) { s.Functions = nil })))
	require.NoError(t, err)
	assert.False(t, found)
	assert.Nil(t, target)
}

func TestFindTarget_Valid(t *testing.T) {
	aux := metricsQuery(func(s *qbtypes.QueryBuilderQuery[qbtypes.MetricAggregation]) {
		s.Name, s.Functions, s.Limit, s.Having = "B", nil, 10, &qbtypes.Having{Expression: "A > 1"}
	})
	formula := qbtypes.QueryEnvelope{Type: qbtypes.QueryTypeFormula, Spec: qbtypes.QueryBuilderFormula{Name: "F", Expression: "A / B"}}
	target, found, err := FindTarget(request(6*time.Hour, aux, metricsQuery(nil), formula))
	require.NoError(t, err)
	require.True(t, found)
	assert.Equal(t, 1, target.QueryIndex)
	assert.Equal(t, "A", target.Spec.Name)
	assert.Equal(t, Args{Target: 3, Seasonality: SeasonalityDaily}, target.Args)
	assert.Equal(t, int64(0), int64(SeasonalityDaily.Period()%target.Step))
	assert.GreaterOrEqual(t, target.Step, time.Minute)
}

func TestFindTarget_Invalid(t *testing.T) {
	ok := func(s *qbtypes.QueryBuilderQuery[qbtypes.MetricAggregation]) {}
	testCases := []struct {
		name string
		req  *qbtypes.QueryRangeRequest
	}{
		{name: "TwoQueriesWithAnomaly", req: request(time.Hour, metricsQuery(ok), metricsQuery(func(s *qbtypes.QueryBuilderQuery[qbtypes.MetricAggregation]) { s.Name = "B" }))},
		{name: "TwoAnomalyInOneQuery", req: request(time.Hour, metricsQuery(func(s *qbtypes.QueryBuilderQuery[qbtypes.MetricAggregation]) {
			s.Functions = append(s.Functions, s.Functions[0])
		}))},
		{name: "AnomalyOnLogs", req: request(time.Hour, qbtypes.QueryEnvelope{Type: qbtypes.QueryTypeBuilder, Spec: qbtypes.QueryBuilderQuery[qbtypes.LogAggregation]{Name: "L", Signal: telemetrytypes.SignalLogs, Functions: []qbtypes.Function{anomalyFn(positional(3))}}})},
		{name: "AnomalyOnFormula", req: request(time.Hour, qbtypes.QueryEnvelope{Type: qbtypes.QueryTypeFormula, Spec: qbtypes.QueryBuilderFormula{Name: "F", Expression: "A", Functions: []qbtypes.Function{anomalyFn(positional(3))}}})},
		{name: "NotTimeSeries", req: func() *qbtypes.QueryRangeRequest {
			r := request(time.Hour, metricsQuery(ok))
			r.RequestType = qbtypes.RequestTypeScalar
			return r
		}()},
		{name: "FillGaps", req: func() *qbtypes.QueryRangeRequest {
			r := request(time.Hour, metricsQuery(ok))
			r.FormatOptions = &qbtypes.FormatOptions{FillGaps: true}
			return r
		}()},
		{name: "WindowAboveSevenDays", req: request(7*24*time.Hour+time.Minute, metricsQuery(ok))},
		{name: "Disabled", req: request(time.Hour, metricsQuery(func(s *qbtypes.QueryBuilderQuery[qbtypes.MetricAggregation]) { s.Disabled = true }))},
		{name: "MeterSource", req: request(time.Hour, metricsQuery(func(s *qbtypes.QueryBuilderQuery[qbtypes.MetricAggregation]) { s.Source = telemetrytypes.SourceMeter }))},
		{name: "TwoAggregations", req: request(time.Hour, metricsQuery(func(s *qbtypes.QueryBuilderQuery[qbtypes.MetricAggregation]) {
			s.Aggregations = append(s.Aggregations, s.Aggregations[0])
		}))},
		{name: "Limit", req: request(time.Hour, metricsQuery(func(s *qbtypes.QueryBuilderQuery[qbtypes.MetricAggregation]) { s.Limit = 5 }))},
		{name: "Having", req: request(time.Hour, metricsQuery(func(s *qbtypes.QueryBuilderQuery[qbtypes.MetricAggregation]) {
			s.Having = &qbtypes.Having{Expression: "A > 1"}
		}))},
		{name: "AnomalyNotLast", req: request(time.Hour, metricsQuery(func(s *qbtypes.QueryBuilderQuery[qbtypes.MetricAggregation]) {
			s.Functions = append(s.Functions, qbtypes.Function{Name: qbtypes.FunctionNameEWMA3})
		}))},
		{name: "TimeShift", req: request(time.Hour, metricsQuery(func(s *qbtypes.QueryBuilderQuery[qbtypes.MetricAggregation]) {
			s.Functions = append([]qbtypes.Function{{Name: qbtypes.FunctionNameTimeShift, Args: []qbtypes.FunctionArg{positional(60)}}}, s.Functions...)
		}))},
		{name: "FillZero", req: request(time.Hour, metricsQuery(func(s *qbtypes.QueryBuilderQuery[qbtypes.MetricAggregation]) {
			s.Functions = append([]qbtypes.Function{{Name: qbtypes.FunctionNameFillZero}}, s.Functions...)
		}))},
		{name: "BadArgs", req: request(time.Hour, metricsQuery(func(s *qbtypes.QueryBuilderQuery[qbtypes.MetricAggregation]) {
			s.Functions = []qbtypes.Function{anomalyFn(positional(9))}
		}))},
		{name: "StepNotDividingSeason", req: request(time.Hour, metricsQuery(func(s *qbtypes.QueryBuilderQuery[qbtypes.MetricAggregation]) {
			s.Functions = []qbtypes.Function{anomalyFn(positional(3), positional("hourly"))}
			s.StepInterval = qbtypes.Step{Duration: 7 * time.Minute}
		}))},
		{name: "StepBelowMinimum", req: request(7*24*time.Hour, metricsQuery(func(s *qbtypes.QueryBuilderQuery[qbtypes.MetricAggregation]) {
			s.StepInterval = qbtypes.Step{Duration: time.Minute}
		}))},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			target, found, err := FindTarget(testCase.req)
			assert.Error(t, err)
			assert.False(t, found)
			assert.Nil(t, target)
		})
	}
}

func TestFindTarget_Step(t *testing.T) {
	testCases := []struct {
		name        string
		window      time.Duration
		seasonality string
		explicit    time.Duration
		want        time.Duration
	}{
		{name: "ExplicitKept", window: time.Hour, seasonality: "hourly", explicit: 5 * time.Minute, want: 5 * time.Minute},
		{name: "AutoShortWindow", window: 30 * time.Minute, seasonality: "hourly", want: time.Minute},
		{name: "AutoWeekWindow_RoundedToDivisorOfHour", window: 7 * 24 * time.Hour, seasonality: "weekly"},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			req := request(testCase.window, metricsQuery(func(s *qbtypes.QueryBuilderQuery[qbtypes.MetricAggregation]) {
				s.Functions = []qbtypes.Function{anomalyFn(positional(3), positional(testCase.seasonality))}
				s.StepInterval = qbtypes.Step{Duration: testCase.explicit}
			}))
			target, found, err := FindTarget(req)
			require.NoError(t, err)
			require.True(t, found)
			if testCase.want > 0 {
				assert.Equal(t, testCase.want, target.Step)
			}
			assert.Zero(t, time.Hour%target.Step)
		})
	}
}

func TestSeasonalityPeriod(t *testing.T) {
	assert.Equal(t, time.Hour, SeasonalityHourly.Period())
	assert.Equal(t, 24*time.Hour, SeasonalityDaily.Period())
	assert.Equal(t, 7*24*time.Hour, SeasonalityWeekly.Period())
}

func TestFindTarget_AcceptsEveryTimestampResolution(t *testing.T) {
	endMS := uint64(1_800_000_000_000)
	testCases := []struct {
		name  string
		scale func(ms uint64) uint64
	}{
		{name: "Seconds", scale: func(ms uint64) uint64 { return ms / 1_000 }},
		{name: "Milliseconds", scale: func(ms uint64) uint64 { return ms }},
		{name: "Microseconds", scale: func(ms uint64) uint64 { return ms * 1_000 }},
		{name: "Nanoseconds", scale: func(ms uint64) uint64 { return ms * 1_000_000 }},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			req := request(time.Hour, metricsQuery(nil))
			req.Start, req.End = testCase.scale(endMS-uint64((6*time.Hour).Milliseconds())), testCase.scale(endMS)
			start, end := req.Start, req.End
			target, found, err := FindTarget(req)
			require.NoError(t, err)
			require.True(t, found)
			assert.Equal(t, time.Minute, target.Step)
			assert.Equal(t, start, req.Start)
			assert.Equal(t, end, req.End)

			req.Start = testCase.scale(endMS - uint64((8 * 24 * time.Hour).Milliseconds()))
			_, _, err = FindTarget(req)
			assert.Error(t, err)
		})
	}
}
