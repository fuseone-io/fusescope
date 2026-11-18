package watchdogtypes

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// narrow keeps the median of the seasons exactly at the base value with a
// scale of 1.4826 × 3/128 of it, so a score of 4 is 13.9% off the
// prediction; wide puts it at 222.4%.
var (
	narrow = [Seasons]float64{-1.0 / 32, -1.0 / 64, 1.0 / 64, 1.0 / 32}
	wide   = [Seasons]float64{-0.5, -0.25, 0.25, 0.5}
)

// seasonal returns four seasons around requests per bucket, an error rate
// and a p99 of 1ms, each varied by spread.
func seasonal(spread [Seasons]float64, requests, rate float64) []*REDSeries {
	baselines := make([]*REDSeries, Seasons)
	for k := range baselines {
		factor := 1 + spread[k]
		baselines[k] = &REDSeries{Requests: map[int64]float64{}, Errors: map[int64]float64{}, P99: map[int64]float64{}}
		for _, timestamp := range testWindow.Buckets() {
			baselines[k].Requests[timestamp] = requests * factor
			baselines[k].Errors[timestamp] = requests * factor * rate * factor
			baselines[k].P99[timestamp] = 1e6 * factor
		}
	}
	return baselines
}

func withoutBucket(baselines []*REDSeries, bucket int, seasons ...int) []*REDSeries {
	timestamp := testWindow.Buckets()[bucket]
	for _, k := range seasons {
		delete(baselines[k].Requests, timestamp)
		delete(baselines[k].Errors, timestamp)
		delete(baselines[k].P99, timestamp)
	}
	return baselines
}

// point is one current bucket; a nil point has no spans.
type point struct{ requests, errors, p99 float64 }

func current(points ...*point) *REDSeries {
	red := &REDSeries{Requests: map[int64]float64{}, Errors: map[int64]float64{}, P99: map[int64]float64{}}
	for i, timestamp := range testWindow.Buckets() {
		if i < len(points) && points[i] != nil {
			red.Requests[timestamp] = points[i].requests
			red.Errors[timestamp] = points[i].errors
			red.P99[timestamp] = points[i].p99
		}
	}
	return red
}

func at(requests, errors, p99 float64) *point {
	return &point{requests: requests, errors: errors, p99: p99}
}

func TestDetectRED(t *testing.T) {
	ok := at(100, 2, 1e6)
	testCases := []struct {
		name      string
		detector  Detector
		baselines []*REDSeries
		current   *REDSeries
		outcome   Outcome
	}{
		{name: "Throughput_NoCurrentSpans_Anomalous", detector: DetectorThroughputDrop, baselines: seasonal(narrow, 100, 0.02), current: nil, outcome: OutcomeAnomalous},
		{name: "Throughput_OneMissingBucket_Clean", detector: DetectorThroughputDrop, baselines: seasonal(narrow, 100, 0.02), current: current(ok, nil, ok), outcome: OutcomeClean},
		{name: "Throughput_TwoMissingBuckets_Anomalous", detector: DetectorThroughputDrop, baselines: seasonal(narrow, 100, 0.02), current: current(ok, nil, nil), outcome: OutcomeAnomalous},
		{name: "Throughput_Steady_Clean", detector: DetectorThroughputDrop, baselines: seasonal(narrow, 100, 0.02), current: current(ok, ok, ok), outcome: OutcomeClean},
		{name: "Throughput_HalfOfPrediction_OneBucket_Clean", detector: DetectorThroughputDrop, baselines: seasonal(narrow, 100, 0.02), current: current(at(50, 1, 1e6), ok, ok), outcome: OutcomeClean},
		{name: "Throughput_HalfOfPrediction_TwoBuckets_Anomalous", detector: DetectorThroughputDrop, baselines: seasonal(narrow, 100, 0.02), current: current(at(50, 1, 1e6), at(50, 1, 1e6), ok), outcome: OutcomeAnomalous},
		{name: "Throughput_AboveHalfOfPrediction_Clean", detector: DetectorThroughputDrop, baselines: seasonal(narrow, 100, 0.02), current: current(at(51, 1, 1e6), at(51, 1, 1e6), ok), outcome: OutcomeClean},
		{name: "Throughput_ScoreAboveMinusFour_Clean", detector: DetectorThroughputDrop, baselines: seasonal(wide, 100, 0.02), current: current(at(40, 1, 1e6), at(40, 1, 1e6), ok), outcome: OutcomeClean},
		{name: "Throughput_PredictedVolume99_NoData", detector: DetectorThroughputDrop, baselines: seasonal(narrow, 33, 0.02), current: nil, outcome: OutcomeNoData},
		{name: "Throughput_PredictedVolume102_Anomalous", detector: DetectorThroughputDrop, baselines: seasonal(narrow, 34, 0.02), current: nil, outcome: OutcomeAnomalous},
		{name: "Throughput_EightBaselineResiduals_NoData", detector: DetectorThroughputDrop, baselines: withoutBucket(withoutBucket(seasonal(narrow, 100, 0.02), 1, 0, 1), 2, 2, 3), current: nil, outcome: OutcomeNoData},
		{name: "Throughput_FlatBaselineDropToZero_Anomalous", detector: DetectorThroughputDrop, baselines: seasonal([Seasons]float64{}, 100, 0.02), current: nil, outcome: OutcomeAnomalous},
		{name: "Throughput_FlatBaselineSteady_Clean", detector: DetectorThroughputDrop, baselines: seasonal([Seasons]float64{}, 100, 0.02), current: current(ok, ok, ok), outcome: OutcomeClean},
		{name: "Throughput_NoBaseline_NoData", detector: DetectorThroughputDrop, baselines: make([]*REDSeries, Seasons), current: nil, outcome: OutcomeNoData},

		{name: "ErrorRate_Spike_Anomalous", detector: DetectorErrorRate, baselines: seasonal(narrow, 100, 1.0/64), current: current(at(100, 10, 1e6), at(100, 10, 1e6), at(100, 10, 1e6)), outcome: OutcomeAnomalous},
		{name: "ErrorRate_NoCurrentSpans_NoData", detector: DetectorErrorRate, baselines: seasonal(narrow, 100, 1.0/64), current: nil, outcome: OutcomeNoData},
		{name: "ErrorRate_MissingIntermediateBucket_StillEvaluated", detector: DetectorErrorRate, baselines: seasonal(narrow, 100, 1.0/64), current: current(at(100, 10, 1e6), nil, at(100, 10, 1e6)), outcome: OutcomeAnomalous},
		{name: "ErrorRate_SpikeInOneBucket_Clean", detector: DetectorErrorRate, baselines: seasonal(narrow, 1000, 1.0/64), current: current(at(1000, 100, 1e6), at(1000, 16, 1e6), at(1000, 16, 1e6)), outcome: OutcomeClean},
		{name: "ErrorRate_OneBucket_NoData", detector: DetectorErrorRate, baselines: seasonal(narrow, 100, 1.0/64), current: current(at(300, 30, 1e6)), outcome: OutcomeNoData},
		{name: "ErrorRate_NineErrors_NoData", detector: DetectorErrorRate, baselines: seasonal(narrow, 100, 1.0/64), current: current(at(100, 3, 1e6), at(100, 3, 1e6), at(100, 3, 1e6)), outcome: OutcomeNoData},
		{name: "ErrorRate_TenErrors_Anomalous", detector: DetectorErrorRate, baselines: seasonal(narrow, 100, 1.0/64), current: current(at(100, 4, 1e6), at(100, 3, 1e6), at(100, 3, 1e6)), outcome: OutcomeAnomalous},
		{name: "ErrorRate_49Requests_NoData", detector: DetectorErrorRate, baselines: seasonal(narrow, 100, 1.0/64), current: current(at(17, 4, 1e6), at(16, 3, 1e6), at(16, 3, 1e6)), outcome: OutcomeNoData},
		{name: "ErrorRate_50Requests_Anomalous", detector: DetectorErrorRate, baselines: seasonal(narrow, 100, 1.0/64), current: current(at(17, 4, 1e6), at(17, 3, 1e6), at(16, 3, 1e6)), outcome: OutcomeAnomalous},
		{name: "ErrorRate_RateBelowOnePercent_Clean", detector: DetectorErrorRate, baselines: seasonal(narrow, 1000, 0.001), current: current(at(1000, 10, 1e6), at(1000, 9, 1e6), at(1000, 9, 1e6)), outcome: OutcomeClean},
		{name: "ErrorRate_RateOnePercent_Anomalous", detector: DetectorErrorRate, baselines: seasonal(narrow, 1000, 0.001), current: current(at(1000, 10, 1e6), at(1000, 10, 1e6), at(1000, 9, 1e6)), outcome: OutcomeAnomalous},
		{name: "ErrorRate_BelowRatio_Clean", detector: DetectorErrorRate, baselines: seasonal(narrow, 1024, 1.0/32), current: current(at(1024, 47, 1e6), at(1024, 47, 1e6), at(1024, 32, 1e6)), outcome: OutcomeClean},
		{name: "ErrorRate_AtRatio_Anomalous", detector: DetectorErrorRate, baselines: seasonal(narrow, 1024, 1.0/32), current: current(at(1024, 48, 1e6), at(1024, 48, 1e6), at(1024, 32, 1e6)), outcome: OutcomeAnomalous},
		{name: "ErrorRate_ScoreBelowFour_Clean", detector: DetectorErrorRate, baselines: seasonal(wide, 1000, 0.02), current: current(at(1000, 64, 1e6), at(1000, 64, 1e6), at(1000, 20, 1e6)), outcome: OutcomeClean},
		{name: "ErrorRate_ScoreAboveFour_Anomalous", detector: DetectorErrorRate, baselines: seasonal(wide, 1000, 0.02), current: current(at(1000, 65, 1e6), at(1000, 65, 1e6), at(1000, 20, 1e6)), outcome: OutcomeAnomalous},
		{name: "ErrorRate_FlatZeroBaseline_Anomalous", detector: DetectorErrorRate, baselines: seasonal(narrow, 100, 0), current: current(at(100, 5, 1e6), at(100, 5, 1e6), at(100, 5, 1e6)), outcome: OutcomeAnomalous},
		{name: "ErrorRate_NoBaseline_NoData", detector: DetectorErrorRate, baselines: make([]*REDSeries, Seasons), current: current(at(100, 10, 1e6), at(100, 10, 1e6), at(100, 10, 1e6)), outcome: OutcomeNoData},

		{name: "Latency_RegressionInTwoBuckets_Anomalous", detector: DetectorLatencyP99, baselines: seasonal(narrow, 100, 0.02), current: current(at(100, 2, 2e6), at(100, 2, 2e6), ok), outcome: OutcomeAnomalous},
		{name: "Latency_RegressionInOneBucket_Clean", detector: DetectorLatencyP99, baselines: seasonal(narrow, 100, 0.02), current: current(at(100, 2, 2e6), ok, ok), outcome: OutcomeClean},
		{name: "Latency_NoCurrentSpans_NoData", detector: DetectorLatencyP99, baselines: seasonal(narrow, 100, 0.02), current: nil, outcome: OutcomeNoData},
		{name: "Latency_MissingIntermediateBucket_StillEvaluated", detector: DetectorLatencyP99, baselines: seasonal(narrow, 100, 0.02), current: current(ok, nil, ok), outcome: OutcomeClean},
		{name: "Latency_BelowRatio_Clean", detector: DetectorLatencyP99, baselines: seasonal(narrow, 100, 0.02), current: current(at(100, 2, 1.49e6), at(100, 2, 1.49e6), ok), outcome: OutcomeClean},
		{name: "Latency_AtRatio_Anomalous", detector: DetectorLatencyP99, baselines: seasonal(narrow, 100, 0.02), current: current(at(100, 2, 1.5e6), at(100, 2, 1.5e6), ok), outcome: OutcomeAnomalous},
		{name: "Latency_ScoreBelowFour_Clean", detector: DetectorLatencyP99, baselines: seasonal(wide, 100, 0.02), current: current(at(100, 2, 3.2e6), at(100, 2, 3.2e6), ok), outcome: OutcomeClean},
		{name: "Latency_ScoreAboveFour_Anomalous", detector: DetectorLatencyP99, baselines: seasonal(wide, 100, 0.02), current: current(at(100, 2, 3.25e6), at(100, 2, 3.25e6), ok), outcome: OutcomeAnomalous},
		{name: "Latency_49Requests_NoData", detector: DetectorLatencyP99, baselines: seasonal(narrow, 100, 0.02), current: current(at(17, 0, 2e6), at(16, 0, 2e6), at(16, 0, 2e6)), outcome: OutcomeNoData},
		{name: "Latency_50Requests_Anomalous", detector: DetectorLatencyP99, baselines: seasonal(narrow, 100, 0.02), current: current(at(17, 0, 2e6), at(17, 0, 2e6), at(16, 0, 2e6)), outcome: OutcomeAnomalous},
		{name: "Latency_FlatBaselineJump_Anomalous", detector: DetectorLatencyP99, baselines: seasonal([Seasons]float64{}, 100, 0.02), current: current(at(100, 2, 2e6), at(100, 2, 2e6), ok), outcome: OutcomeAnomalous},
		{name: "Latency_FlatBaselineSteady_Clean", detector: DetectorLatencyP99, baselines: seasonal([Seasons]float64{}, 100, 0.02), current: current(ok, ok, ok), outcome: OutcomeClean},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			verdict, err := DetectRED(testCase.detector, REDInput{Window: testWindow, Service: "checkout", Current: testCase.current, Baselines: testCase.baselines})
			require.NoError(t, err)
			assert.Equal(t, testCase.outcome, verdict.Outcome)
			if testCase.outcome == OutcomeAnomalous {
				require.NotNil(t, verdict.Evidence)
				require.NotNil(t, verdict.PeakScore)
				assert.NoError(t, verdict.Evidence.Validate())
			}
		})
	}
}

func TestDetectRED_Evidence(t *testing.T) {
	baselines := withoutBucket(seasonal(narrow, 100, 0.02), 2, 0, 3)
	verdict, err := DetectRED(DetectorThroughputDrop, REDInput{Window: testWindow, Service: "checkout", Current: current(at(100, 2, 1e6)), Baselines: baselines, Warnings: []string{"a shard timed out"}})
	require.NoError(t, err)
	require.Equal(t, OutcomeAnomalous, verdict.Outcome)
	evidence := verdict.Evidence
	require.Len(t, evidence.Buckets, WindowBuckets)
	assert.Equal(t, EvidenceVersion, evidence.Version)
	assert.Equal(t, []string{"a shard timed out", syntheticZeroWarning}, evidence.Warnings)
	for i, bucket := range evidence.Buckets {
		assert.Equal(t, testWindow.Buckets()[i], bucket.Timestamp.UnixMilli())
		require.NotNil(t, bucket.Value)
		require.NotNil(t, bucket.Prediction)
		require.NotNil(t, bucket.Score)
	}
	assert.InDelta(t, 100, *evidence.Buckets[0].Value, 1e-9)
	assert.InDelta(t, 0, *evidence.Buckets[1].Value, 1e-9)
	// Seasons 1 and 4 have no spans in the last bucket: they stay out of its
	// prediction instead of counting as zero.
	assert.InDelta(t, 100, *evidence.Buckets[2].Prediction, 1e-9)
	assert.Less(t, *evidence.Buckets[1].Score, -4.0)
	assert.InDelta(t, *verdict.PeakScore, evidence.Score, 1e-9)
	assert.InDelta(t, *evidence.Buckets[1].Score, *verdict.PeakScore, 1e-9)

	latency, err := DetectRED(DetectorLatencyP99, REDInput{Window: testWindow, Service: "checkout", Current: current(at(100, 2, 2e6), nil, at(100, 2, 2e6)), Baselines: seasonal(narrow, 100, 0.02)})
	require.NoError(t, err)
	require.Equal(t, OutcomeAnomalous, latency.Outcome)
	assert.Nil(t, latency.Evidence.Buckets[1].Value)
	assert.Nil(t, latency.Evidence.Buckets[1].Score)
	assert.Empty(t, latency.Evidence.Warnings)
}
