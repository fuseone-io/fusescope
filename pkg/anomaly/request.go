package anomaly

import (
	"slices"
	"time"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/querybuilder"
	qbtypes "github.com/fuseone-io/fusescope/pkg/types/querybuildertypes/querybuildertypesv5"
	"github.com/fuseone-io/fusescope/pkg/types/telemetrytypes"
)

const (
	// Seasons is how many earlier seasons make the baseline.
	Seasons   = 4
	MinTarget = 1
	MaxTarget = 7
	// MaxWindow bounds the evaluated window on every path.
	MaxWindow = 7 * 24 * time.Hour

	argTarget      = "z_score_threshold"
	argSeasonality = "seasonality"
)

var (
	SeasonalityHourly = Seasonality("hourly")
	SeasonalityDaily  = Seasonality("daily")
	SeasonalityWeekly = Seasonality("weekly")

	ErrCodeInvalidRequest = errors.MustNewCode("anomaly_invalid_request")

	// stepDivisors are the steps that divide an hour, so every season period too.
	stepDivisors = []time.Duration{
		time.Minute, 72 * time.Second, 75 * time.Second, 80 * time.Second, 90 * time.Second, 100 * time.Second,
		2 * time.Minute, 144 * time.Second, 150 * time.Second, 3 * time.Minute, 200 * time.Second, 225 * time.Second,
		4 * time.Minute, 5 * time.Minute, 6 * time.Minute, 400 * time.Second, 450 * time.Second, 10 * time.Minute,
		12 * time.Minute, 15 * time.Minute, 20 * time.Minute, 30 * time.Minute, time.Hour,
	}
)

type Seasonality string

// Args are the anomaly function's arguments: the band half-width in scale units and the season.
type Args struct {
	Target      float64
	Seasonality Seasonality
}

// Target is the one builder query of a request that carries the anomaly function.
type Target struct {
	QueryIndex int
	Spec       qbtypes.QueryBuilderQuery[qbtypes.MetricAggregation]
	Args       Args
	// Start and End are the request's window in epoch milliseconds, whatever resolution it used.
	Start, End uint64
	// Step is the step every window of the evaluation uses: it divides the season period.
	Step time.Duration
}

func (s Seasonality) Period() time.Duration {
	switch s {
	case SeasonalityDaily:
		return 24 * time.Hour
	case SeasonalityWeekly:
		return 7 * 24 * time.Hour
	}
	return time.Hour
}

func NewSeasonality(value string) (Seasonality, error) {
	switch s := Seasonality(value); s {
	case SeasonalityHourly, SeasonalityDaily, SeasonalityWeekly:
		return s, nil
	}
	return "", invalid("seasonality must be hourly, daily or weekly, got %q", value)
}

// ParseArgs reads z_score_threshold (named, or at position 0) and seasonality (named, or at
// position 1, hourly when absent). Unknown or repeated names, and a named value that differs
// from the positional one, are refused.
func ParseArgs(fn qbtypes.Function) (Args, error) {
	values := map[string]any{}
	namedSeen := map[string]bool{}
	for i, arg := range fn.Args {
		name := arg.Name
		switch {
		case name == "" && i == 0:
			name = argTarget
		case name == "" && i == 1:
			name = argSeasonality
		case name == "":
			return Args{}, invalid("anomaly takes at most 2 positional arguments")
		case name != argTarget && name != argSeasonality:
			return Args{}, invalid("anomaly has no argument %q", name)
		case namedSeen[name]:
			return Args{}, invalid("anomaly argument %q is given twice", name)
		default:
			namedSeen[name] = true
		}
		if previous, seen := values[name]; seen && !sameArg(previous, arg.Value) {
			return Args{}, invalid("anomaly argument %q is given two different values", name)
		}
		values[name] = arg.Value
	}

	raw, ok := values[argTarget]
	if !ok {
		return Args{}, invalid("anomaly needs %s", argTarget)
	}
	target, err := qbtypes.ParseFunctionArgNumber(raw)
	if err != nil {
		return Args{}, invalid("anomaly %s must be a number", argTarget)
	}
	if target < MinTarget || target > MaxTarget {
		return Args{}, invalid("anomaly %s must be between %d and %d, got %v", argTarget, MinTarget, MaxTarget, target)
	}

	seasonality := SeasonalityHourly
	if raw, ok := values[argSeasonality]; ok {
		text, isString := raw.(string)
		if !isString {
			return Args{}, invalid("anomaly %s must be a string", argSeasonality)
		}
		if seasonality, err = NewSeasonality(text); err != nil {
			return Args{}, err
		}
	}
	return Args{Target: target, Seasonality: seasonality}, nil
}

// FindTarget returns the request's anomaly target and true, false when the request has no
// anomaly function, or an invalid-input error when it cannot be evaluated for anomalies.
func FindTarget(req *qbtypes.QueryRangeRequest) (*Target, bool, error) {
	occurrences := req.FindFunctions(qbtypes.FunctionNameAnomaly)
	if len(occurrences) == 0 {
		return nil, false, nil
	}
	if len(occurrences) > 1 {
		return nil, false, invalid("a request may use the anomaly function once, found %d", len(occurrences))
	}
	if req.RequestType != qbtypes.RequestTypeTimeSeries {
		return nil, false, invalid("anomaly needs a time_series request")
	}
	if req.FormatOptions != nil && req.FormatOptions.FillGaps {
		return nil, false, invalid("anomaly does not support fillGaps: filled zeros would read as a baseline")
	}
	start, end := querybuilder.ToMilliSecs(req.Start), querybuilder.ToMilliSecs(req.End)
	if end <= start || time.Duration(end-start)*time.Millisecond > MaxWindow {
		return nil, false, invalid("anomaly needs a window of at most %s", MaxWindow)
	}

	occurrence := occurrences[0]
	envelope := req.CompositeQuery.Queries[occurrence.QueryIndex]
	spec, ok := envelope.Spec.(qbtypes.QueryBuilderQuery[qbtypes.MetricAggregation])
	if !ok || envelope.Type != qbtypes.QueryTypeBuilder || spec.Signal != telemetrytypes.SignalMetrics {
		return nil, false, invalid("anomaly applies to a metrics builder query, not %s", occurrence.QueryName)
	}
	if err := validateTargetSpec(spec, occurrence.FunctionIndex); err != nil {
		return nil, false, err
	}
	args, err := ParseArgs(spec.Functions[occurrence.FunctionIndex])
	if err != nil {
		return nil, false, err
	}
	step, err := chooseStep(spec.StepInterval.Duration, start, end, args.Seasonality)
	if err != nil {
		return nil, false, err
	}
	return &Target{QueryIndex: occurrence.QueryIndex, Spec: spec, Args: args, Start: start, End: end, Step: step}, true, nil
}

func validateTargetSpec(spec qbtypes.QueryBuilderQuery[qbtypes.MetricAggregation], fnIndex int) error {
	switch {
	case spec.Disabled:
		return invalid("anomaly query %s is disabled", spec.Name)
	case spec.Source == telemetrytypes.SourceMeter:
		return invalid("anomaly does not apply to meter metrics")
	case len(spec.Aggregations) != 1:
		return invalid("anomaly query %s needs exactly one aggregation", spec.Name)
	case spec.Limit != 0:
		return invalid("anomaly query %s cannot set a limit: each window would keep its own top series", spec.Name)
	case spec.Having != nil && spec.Having.Expression != "":
		return invalid("anomaly query %s cannot set having", spec.Name)
	case fnIndex != len(spec.Functions)-1:
		return invalid("anomaly must be the last function of %s", spec.Name)
	}
	for _, fn := range spec.Functions[:fnIndex] {
		switch fn.Name {
		case qbtypes.FunctionNameTimeShift:
			return invalid("anomaly query %s cannot use timeShift", spec.Name)
		case qbtypes.FunctionNameFillZero:
			return invalid("anomaly query %s cannot use fillZero: filled zeros would read as a baseline", spec.Name)
		}
	}
	return nil
}

// chooseStep keeps an explicit step that divides the season period and is not below the window's
// minimum, or picks the smallest divisor of an hour at or above the recommended step.
func chooseStep(explicit time.Duration, start, end uint64, seasonality Seasonality) (time.Duration, error) {
	minimum := time.Duration(querybuilder.MinAllowedStepIntervalForMetric(start, end)) * time.Second
	if explicit > 0 {
		if explicit%time.Second != 0 || seasonality.Period()%explicit != 0 {
			return 0, invalid("anomaly step %s must divide the %s season", explicit, seasonality)
		}
		if explicit < minimum {
			return 0, invalid("anomaly step %s is below the %s minimum for this window", explicit, minimum)
		}
		return explicit, nil
	}
	recommended := max(minimum, time.Duration(querybuilder.RecommendedStepIntervalForMetric(start, end))*time.Second)
	i, _ := slices.BinarySearch(stepDivisors, recommended)
	if i == len(stepDivisors) {
		return time.Hour, nil
	}
	return stepDivisors[i], nil
}

// sameArg compares two argument values as numbers when both are, else as strings.
func sameArg(a, b any) bool {
	left, errLeft := qbtypes.ParseFunctionArgNumber(a)
	right, errRight := qbtypes.ParseFunctionArgNumber(b)
	if errLeft == nil && errRight == nil {
		return left == right
	}
	leftText, leftOK := a.(string)
	rightText, rightOK := b.(string)
	return leftOK && rightOK && leftText == rightText
}

func invalid(format string, args ...any) error {
	return errors.Newf(errors.TypeInvalidInput, ErrCodeInvalidRequest, format, args...)
}
