// Package anomaly scores a time series against seasonal baselines: the predicted value is the
// median of the seasons at each timestamp, and the scale is the MAD of every residual, scaled to
// be consistent with a standard deviation under normal residuals.
package anomaly

import (
	"cmp"
	"encoding/json"
	"math"
	"slices"
	"strconv"

	"github.com/fuseone-io/fusescope/pkg/errors"
	qbtypes "github.com/fuseone-io/fusescope/pkg/types/querybuildertypes/querybuildertypesv5"
)

const (
	// zMax bounds every score, and is the score of a point that moved off a flat baseline:
	// finite, and above any target.
	zMax         = 100
	madScale     = 1.4826
	minSeasons   = 2
	minResiduals = 10
	flatAbsTol   = 1e-9
	flatRelTol   = 1e-9
)

// Reason is the outcome of one current point. Every point has exactly one, by precedence:
// partial, invalid_value, insufficient_baseline, missing_baseline, flat_baseline, scored.
type Reason string

const (
	ReasonPartial              Reason = "partial"
	ReasonInvalidValue         Reason = "invalid_value"
	ReasonInsufficientBaseline Reason = "insufficient_baseline"
	ReasonMissingBaseline      Reason = "missing_baseline"
	ReasonFlatBaseline         Reason = "flat_baseline"
	ReasonScored               Reason = "scored"
)

var ErrCodeInvalidTarget = errors.MustNewCode("anomaly_invalid_target")

type SeriesStatus struct {
	// FlatBaseline is set when the series was scored against a baseline with no dispersion.
	FlatBaseline bool
}

// Result holds one series per current series, in its order and with its labels. Scores carry
// a point for each scored or flat_baseline point; the bands and the prediction share them.
type Result struct {
	Predicted []*qbtypes.TimeSeries
	Upper     []*qbtypes.TimeSeries
	Lower     []*qbtypes.TimeSeries
	Scores    []*qbtypes.TimeSeries
	Outcomes  map[Reason]int
	PerSeries map[string]SeriesStatus
}

// Score scores each current series against the series with the same labels in each baseline.
// Baseline timestamps must already be on the current timeline. target is the band half-width in
// scale units.
func Score(current []*qbtypes.TimeSeries, baselines [][]*qbtypes.TimeSeries, target float64) (*Result, error) {
	if !(target > 0) || math.IsInf(target, 0) {
		return nil, errors.Newf(errors.TypeInvalidInput, ErrCodeInvalidTarget, "anomaly target must be a positive number, got %v", target)
	}
	seasons := make([]map[string]*qbtypes.TimeSeries, len(baselines))
	for i, season := range baselines {
		seasons[i] = make(map[string]*qbtypes.TimeSeries, len(season))
		for _, s := range season {
			key, err := LabelsKey(s.Labels)
			if err != nil {
				return nil, err
			}
			if _, seen := seasons[i][key]; !seen {
				seasons[i][key] = s
			}
		}
	}

	result := &Result{
		Predicted: make([]*qbtypes.TimeSeries, 0, len(current)),
		Upper:     make([]*qbtypes.TimeSeries, 0, len(current)),
		Lower:     make([]*qbtypes.TimeSeries, 0, len(current)),
		Scores:    make([]*qbtypes.TimeSeries, 0, len(current)),
		Outcomes:  map[Reason]int{},
		PerSeries: make(map[string]SeriesStatus, len(current)),
	}
	sc := &scratch{}
	for _, s := range current {
		key, err := LabelsKey(s.Labels)
		if err != nil {
			return nil, err
		}
		matched := make([]*qbtypes.TimeSeries, 0, len(seasons))
		for _, season := range seasons {
			if b, ok := season[key]; ok {
				matched = append(matched, b)
			}
		}
		scored := sc.scoreSeries(s, matched, target, result.Outcomes)
		result.Predicted = append(result.Predicted, scored.predicted)
		result.Upper = append(result.Upper, scored.upper)
		result.Lower = append(result.Lower, scored.lower)
		result.Scores = append(result.Scores, scored.scores)
		result.PerSeries[key] = scored.status
	}
	return result, nil
}

// LabelsKey identifies a label set for matching series within one evaluation; it is not a wire
// format. Pairs are sorted by name, names and string values are quoted, and every value carries a
// type tag: order does not matter, separators inside values cannot collide and 1 differs from
// "1". Integers and integral floats share a number form, as they do in JSON.
func LabelsKey(labels []*qbtypes.Label) (string, error) {
	sorted := slices.Clone(labels)
	slices.SortStableFunc(sorted, func(a, b *qbtypes.Label) int { return cmp.Compare(a.Key.Name, b.Key.Name) })
	buf := make([]byte, 0, 32*len(sorted))
	for _, l := range sorted {
		buf = strconv.AppendQuote(buf, l.Key.Name)
		buf = append(buf, '=')
		var err error
		if buf, err = appendValue(buf, l.Value); err != nil {
			return "", err
		}
		buf = append(buf, ';')
	}
	return string(buf), nil
}

func appendValue(buf []byte, value any) ([]byte, error) {
	switch v := value.(type) {
	case nil:
		return append(buf, 'z'), nil
	case string:
		return strconv.AppendQuote(append(buf, 's'), v), nil
	case bool:
		return strconv.AppendBool(append(buf, 'b'), v), nil
	case int:
		return strconv.AppendInt(append(buf, 'n'), int64(v), 10), nil
	case int32:
		return strconv.AppendInt(append(buf, 'n'), int64(v), 10), nil
	case int64:
		return strconv.AppendInt(append(buf, 'n'), v, 10), nil
	case uint32:
		return strconv.AppendUint(append(buf, 'n'), uint64(v), 10), nil
	case uint64:
		return strconv.AppendUint(append(buf, 'n'), v, 10), nil
	case float32:
		return strconv.AppendFloat(append(buf, 'n'), float64(v), 'g', -1, 32), nil
	case float64:
		return strconv.AppendFloat(append(buf, 'n'), v, 'g', -1, 64), nil
	}
	raw, err := json.Marshal(value)
	if err != nil {
		return nil, errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "cannot key series label value of type %T", value)
	}
	return strconv.AppendQuote(append(buf, 'j'), string(raw)), nil
}

type scoredSeries struct {
	predicted, upper, lower, scores *qbtypes.TimeSeries
	status                          SeriesStatus
}

type sample struct {
	timestamp int64
	value     float64
}

// scratch holds the buffers one Score call reuses across its series.
type scratch struct {
	samples   []sample
	predicted []sample
	residuals []float64
	window    []float64
	// bounds are the [next, end) offsets of each season's samples, consumed by the merge.
	bounds [][2]int
}

func (sc *scratch) scoreSeries(current *qbtypes.TimeSeries, baselines []*qbtypes.TimeSeries, target float64, outcomes map[Reason]int) scoredSeries {
	n := len(current.Values)
	backing := make([]qbtypes.TimeSeriesValue, 4*n)
	pointers := make([]*qbtypes.TimeSeriesValue, 4*n)
	out := scoredSeries{
		predicted: &qbtypes.TimeSeries{Labels: current.Labels, Values: pointers[0:0:n]},
		upper:     &qbtypes.TimeSeries{Labels: current.Labels, Values: pointers[n : n : 2*n]},
		lower:     &qbtypes.TimeSeries{Labels: current.Labels, Values: pointers[2*n : 2*n : 3*n]},
		scores:    &qbtypes.TimeSeries{Labels: current.Labels, Values: pointers[3*n : 3*n : 4*n]},
	}
	sc.predict(baselines)
	sufficient := len(sc.residuals) >= minResiduals
	var scale float64
	finite := true
	if sufficient {
		scale = madScale * mad(sc.residuals)
		finite = isFinite(scale)
		out.status.FlatBaseline = finite && scale == 0
	}

	used := 0
	emit := func(series *qbtypes.TimeSeries, timestamp int64, value float64) {
		backing[used] = qbtypes.TimeSeriesValue{Timestamp: timestamp, Value: value}
		series.Values = append(series.Values, &backing[used])
		used++
	}
	for _, point := range current.Values {
		p, found := sc.prediction(point.Timestamp)
		reason := classify(point, sufficient, found, finite)
		if reason == ReasonScored && out.status.FlatBaseline {
			reason = ReasonFlatBaseline
		}
		outcomes[reason]++
		if reason != ReasonScored && reason != ReasonFlatBaseline {
			continue
		}
		z := flatScore(point.Value, p)
		if scale > 0 {
			z = max(-zMax, min(zMax, (point.Value-p)/scale))
		}
		emit(out.predicted, point.Timestamp, p)
		emit(out.upper, point.Timestamp, saturate(p+target*scale))
		emit(out.lower, point.Timestamp, saturate(p-target*scale))
		emit(out.scores, point.Timestamp, z)
	}
	return out
}

// classify gives a point its outcome. A scale that overflowed (residuals near ±MaxFloat64)
// makes every eligible point of the series invalid_value: nothing non-finite is emitted.
func classify(point *qbtypes.TimeSeriesValue, sufficient bool, predicted bool, finiteScale bool) Reason {
	switch {
	case point.Partial:
		return ReasonPartial
	case !isFinite(point.Value), !finiteScale:
		return ReasonInvalidValue
	case !sufficient:
		return ReasonInsufficientBaseline
	case !predicted:
		return ReasonMissingBaseline
	}
	return ReasonScored
}

// predict sets the median of the seasons at every timestamp at least minSeasons of them hold,
// sorted by timestamp, and the residuals of each season against it.
func (sc *scratch) predict(baselines []*qbtypes.TimeSeries) {
	sc.samples, sc.predicted, sc.residuals = sc.samples[:0], sc.predicted[:0], sc.residuals[:0]
	sc.bounds = sc.bounds[:0]
	for _, b := range baselines {
		start := len(sc.samples)
		for _, v := range b.Values {
			if v.Partial || !isFinite(v.Value) {
				continue
			}
			sc.samples = append(sc.samples, sample{timestamp: v.Timestamp, value: v.Value})
		}
		segment := sc.samples[start:]
		if !slices.IsSortedFunc(segment, compareSamples) {
			slices.SortStableFunc(segment, compareSamples)
		}
		sc.bounds = append(sc.bounds, [2]int{start, len(sc.samples)})
	}
	for {
		timestamp, ok := sc.nextTimestamp()
		if !ok {
			return
		}
		sc.window = sc.window[:0]
		for i := range sc.bounds {
			// One value per season and timestamp: a repeated timestamp keeps its first value.
			if sc.bounds[i][0] < sc.bounds[i][1] && sc.samples[sc.bounds[i][0]].timestamp == timestamp {
				sc.window = append(sc.window, sc.samples[sc.bounds[i][0]].value)
			}
			for sc.bounds[i][0] < sc.bounds[i][1] && sc.samples[sc.bounds[i][0]].timestamp == timestamp {
				sc.bounds[i][0]++
			}
		}
		if len(sc.window) < minSeasons {
			continue
		}
		start := len(sc.residuals)
		sc.residuals = append(sc.residuals, sc.window...)
		p := median(sc.window)
		sc.predicted = append(sc.predicted, sample{timestamp: timestamp, value: p})
		for i := start; i < len(sc.residuals); i++ {
			sc.residuals[i] -= p
		}
	}
}

// nextTimestamp is the smallest timestamp left in any season.
func (sc *scratch) nextTimestamp() (int64, bool) {
	var timestamp int64
	found := false
	for _, b := range sc.bounds {
		if b[0] < b[1] && (!found || sc.samples[b[0]].timestamp < timestamp) {
			timestamp, found = sc.samples[b[0]].timestamp, true
		}
	}
	return timestamp, found
}

func compareSamples(a, b sample) int { return cmp.Compare(a.timestamp, b.timestamp) }

func (sc *scratch) prediction(timestamp int64) (float64, bool) {
	i, found := slices.BinarySearchFunc(sc.predicted, sample{timestamp: timestamp}, compareSamples)
	if !found {
		return 0, false
	}
	return sc.predicted[i].value, true
}

func isFinite(v float64) bool { return !math.IsNaN(v) && !math.IsInf(v, 0) }

// saturate keeps a band that overflowed at the largest finite value of its sign.
func saturate(v float64) float64 { return max(-math.MaxFloat64, min(math.MaxFloat64, v)) }

func flatScore(x, p float64) float64 {
	diff := x - p
	if math.Abs(diff) <= flatAbsTol+flatRelTol*math.Max(math.Abs(x), math.Abs(p)) {
		return 0
	}
	return math.Copysign(zMax, diff)
}

// median sorts values in place; an even count gives the midpoint of the two middle values.
func median(values []float64) float64 {
	slices.Sort(values)
	n := len(values)
	if n%2 == 1 {
		return values[n/2]
	}
	return midpoint(values[n/2-1], values[n/2])
}

// midpoint neither overflows nor underflows for finite a ≤ b: with one sign b−a cannot overflow
// and a stays exact; with opposite signs the sum cannot overflow and rounds once.
func midpoint(a, b float64) float64 {
	if math.Signbit(a) == math.Signbit(b) {
		return a + (b-a)/2
	}
	return (a + b) / 2
}

// mad is median(|v − median(v)|); it reorders values.
func mad(values []float64) float64 {
	m := median(values)
	for i, v := range values {
		values[i] = math.Abs(v - m)
	}
	return median(values)
}
