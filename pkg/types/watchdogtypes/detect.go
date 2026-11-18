package watchdogtypes

import (
	"math"
	"time"

	"github.com/fuseone-io/fusescope/pkg/anomaly"
	"github.com/fuseone-io/fusescope/pkg/errors"
	qbtypes "github.com/fuseone-io/fusescope/pkg/types/querybuildertypes/querybuildertypesv5"
	"github.com/fuseone-io/fusescope/pkg/types/telemetrytypes"
)

// RED thresholds. They are not a contract and change with calibration.
const (
	// AnomalyScore bounds a triggering bucket's score: at least it above
	// the baseline, at most its negative below.
	AnomalyScore = 4.0
	// MinEligibleBuckets of the window's buckets must be scored, against a
	// dispersed or a flat baseline.
	MinEligibleBuckets = 2
	// MinTriggeringBuckets of the window's buckets must pass every gate.
	MinTriggeringBuckets = 2

	MinErrorRate      = 0.01
	MinErrorRateRatio = 1.5
	MinErrorRequests  = 50
	MinErrors         = 10

	MinLatencyRatio    = 1.5
	MinLatencyRequests = 50

	MaxThroughputRatio   = 0.5
	MinPredictedRequests = 100
)

const syntheticZeroWarning = "buckets without spans count as zero requests"

// REDInput is one service's window and seasons. Current is nil for a
// service without spans in the window; a baseline is nil for a season
// without them.
type REDInput struct {
	Window    Window
	Service   string
	Current   *REDSeries
	Baselines []*REDSeries
	Warnings  []string
}

// Verdict carries evidence and a peak score only when anomalous.
type Verdict struct {
	Outcome   Outcome
	Evidence  *Evidence
	PeakScore *float64
}

func DetectRED(detector Detector, input REDInput) (Verdict, error) {
	switch detector {
	case DetectorErrorRate:
		return detectErrorRate(input)
	case DetectorLatencyP99:
		return detectLatency(input)
	case DetectorThroughputDrop:
		return detectThroughput(input)
	}
	return Verdict{}, errors.Newf(errors.TypeInvalidInput, ErrCodeUnknownDetector, "%q is not a RED detector", detector.StringValue())
}

type scoredWindow struct {
	values     map[int64]float64
	prediction map[int64]float64
	lower      map[int64]float64
	upper      map[int64]float64
	score      map[int64]float64
	scored     int
	flat       int
}

func detectErrorRate(input REDInput) (Verdict, error) {
	window, err := scoreWindow(input, input.Current.errorRates(input.Window), errorRatesOf(input))
	if err != nil {
		return Verdict{}, err
	}
	requests, errs := input.Current.windowTotals(input.Window)
	if requests < MinErrorRequests || errs < MinErrors || window.eligible() < MinEligibleBuckets {
		return Verdict{Outcome: OutcomeNoData}, nil
	}
	return window.verdict(input, nil, func(timestamp int64) bool {
		rate := window.values[timestamp]
		return window.score[timestamp] >= AnomalyScore && rate >= MinErrorRate && rate >= MinErrorRateRatio*window.prediction[timestamp]
	}), nil
}

func detectLatency(input REDInput) (Verdict, error) {
	window, err := scoreWindow(input, input.Current.latencies(input.Window), latenciesOf(input))
	if err != nil {
		return Verdict{}, err
	}
	requests, _ := input.Current.windowTotals(input.Window)
	if requests < MinLatencyRequests || window.eligible() < MinEligibleBuckets {
		return Verdict{Outcome: OutcomeNoData}, nil
	}
	return window.verdict(input, nil, func(timestamp int64) bool {
		return window.score[timestamp] >= AnomalyScore && window.values[timestamp] >= MinLatencyRatio*window.prediction[timestamp]
	}), nil
}

// detectThroughput fills every current bucket without spans with zero, the
// whole window for a service that stopped; baselines are never filled.
func detectThroughput(input REDInput) (Verdict, error) {
	current := map[int64]float64{}
	var warnings []string
	for _, timestamp := range input.Window.Buckets() {
		value, ok := input.Current.requestsAt(timestamp)
		if !ok {
			warnings = []string{syntheticZeroWarning}
		}
		current[timestamp] = value
	}
	baselines := make([]map[int64]float64, 0, len(input.Baselines))
	for _, baseline := range input.Baselines {
		if baseline != nil {
			baselines = append(baselines, baseline.Requests)
		}
	}
	window, err := scoreWindow(input, current, baselines)
	if err != nil {
		return Verdict{}, err
	}
	if PredictedVolume(input.Window, input.Baselines) < MinPredictedRequests || window.eligible() < MinEligibleBuckets {
		return Verdict{Outcome: OutcomeNoData}, nil
	}
	return window.verdict(input, warnings, func(timestamp int64) bool {
		return window.score[timestamp] <= -AnomalyScore && window.values[timestamp] <= MaxThroughputRatio*window.prediction[timestamp]
	}), nil
}

func scoreWindow(input REDInput, current map[int64]float64, baselines []map[int64]float64) (*scoredWindow, error) {
	labels := []*qbtypes.Label{{Key: telemetrytypes.TelemetryFieldKey{Name: serviceLabel}, Value: input.Service}}
	seasons := make([][]*qbtypes.TimeSeries, len(baselines))
	for k, baseline := range baselines {
		seasons[k] = []*qbtypes.TimeSeries{toSeries(labels, input.Window, baseline)}
	}
	result, err := anomaly.Score([]*qbtypes.TimeSeries{toSeries(labels, input.Window, current)}, seasons, AnomalyScore)
	if err != nil {
		return nil, err
	}
	window := &scoredWindow{
		values:     current,
		prediction: valuesOf(result.Predicted),
		lower:      valuesOf(result.Lower),
		upper:      valuesOf(result.Upper),
		score:      valuesOf(result.Scores),
		scored:     result.Outcomes[anomaly.ReasonScored],
		flat:       result.Outcomes[anomaly.ReasonFlatBaseline],
	}
	return window, nil
}

func (window *scoredWindow) eligible() int {
	return window.scored + window.flat
}

// verdict is anomalous when MinTriggeringBuckets buckets trigger; the peak
// is the most extreme score among them.
func (window *scoredWindow) verdict(input REDInput, warnings []string, triggers func(timestamp int64) bool) Verdict {
	var peak *float64
	triggering := 0
	for _, timestamp := range input.Window.Buckets() {
		score, scored := window.score[timestamp]
		if !scored || !triggers(timestamp) {
			continue
		}
		triggering++
		if peak == nil || math.Abs(score) > math.Abs(*peak) {
			peak = &score
		}
	}
	if triggering < MinTriggeringBuckets {
		return Verdict{Outcome: OutcomeClean}
	}
	evidence := &Evidence{
		Version:  EvidenceVersion,
		Score:    *peak,
		Warnings: append(append([]string{}, input.Warnings...), warnings...),
	}
	for _, timestamp := range input.Window.Buckets() {
		evidence.Buckets = append(evidence.Buckets, EvidenceBucket{
			Timestamp:  time.UnixMilli(timestamp).UTC(),
			Value:      lookup(window.values, timestamp),
			Prediction: lookup(window.prediction, timestamp),
			Lower:      lookup(window.lower, timestamp),
			Upper:      lookup(window.upper, timestamp),
			Score:      lookup(window.score, timestamp),
		})
	}
	return Verdict{Outcome: OutcomeAnomalous, Evidence: evidence, PeakScore: peak}
}

func errorRatesOf(input REDInput) []map[int64]float64 {
	rates := make([]map[int64]float64, 0, len(input.Baselines))
	for _, baseline := range input.Baselines {
		if baseline != nil {
			rates = append(rates, baseline.errorRates(input.Window))
		}
	}
	return rates
}

func latenciesOf(input REDInput) []map[int64]float64 {
	latencies := make([]map[int64]float64, 0, len(input.Baselines))
	for _, baseline := range input.Baselines {
		if baseline != nil {
			latencies = append(latencies, baseline.latencies(input.Window))
		}
	}
	return latencies
}

// errorRates is the error ratio of each bucket with requests; a bucket
// without an error count had none.
func (red *REDSeries) errorRates(window Window) map[int64]float64 {
	rates := map[int64]float64{}
	for _, timestamp := range window.Buckets() {
		if requests, ok := red.requestsAt(timestamp); ok && requests > 0 {
			rates[timestamp] = red.Errors[timestamp] / requests
		}
	}
	return rates
}

func (red *REDSeries) latencies(window Window) map[int64]float64 {
	latencies := map[int64]float64{}
	for _, timestamp := range window.Buckets() {
		requests, ok := red.requestsAt(timestamp)
		if !ok || requests <= 0 {
			continue
		}
		if p99, ok := red.P99[timestamp]; ok {
			latencies[timestamp] = p99
		}
	}
	return latencies
}

func (red *REDSeries) requestsAt(timestamp int64) (float64, bool) {
	if red == nil {
		return 0, false
	}
	value, ok := red.Requests[timestamp]
	return value, ok
}

func (red *REDSeries) windowTotals(window Window) (float64, float64) {
	if red == nil {
		return 0, 0
	}
	requests, errs := 0.0, 0.0
	for _, timestamp := range window.Buckets() {
		requests += red.Requests[timestamp]
		errs += red.Errors[timestamp]
	}
	return requests, errs
}

func toSeries(labels []*qbtypes.Label, window Window, values map[int64]float64) *qbtypes.TimeSeries {
	series := &qbtypes.TimeSeries{Labels: labels}
	for _, timestamp := range window.Buckets() {
		if value, ok := values[timestamp]; ok {
			series.Values = append(series.Values, &qbtypes.TimeSeriesValue{Timestamp: timestamp, Value: value})
		}
	}
	return series
}

func valuesOf(series []*qbtypes.TimeSeries) map[int64]float64 {
	values := map[int64]float64{}
	for _, s := range series {
		for _, value := range s.Values {
			values[value.Timestamp] = value.Value
		}
	}
	return values
}

func lookup(values map[int64]float64, timestamp int64) *float64 {
	value, ok := values[timestamp]
	if !ok {
		return nil
	}
	return &value
}
