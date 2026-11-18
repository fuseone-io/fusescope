package watchdogtypes

import (
	"math"

	qbtypes "github.com/fuseone-io/fusescope/pkg/types/querybuildertypes/querybuildertypesv5"
	"github.com/fuseone-io/fusescope/pkg/types/telemetrytypes"
)

const (
	redQueryName       = "A"
	redScope           = "isRoot = true OR isEntryPoint = true"
	servicesVariable   = "watchdog_services"
	serviceLabel       = "service.name"
	requestsAggregate  = 0
	errorsAggregate    = 1
	latencyAggregate   = 2
	requestsExpression = "count()"
)

// REDSeries is one service's RED aggregations, by bucket timestamp in
// milliseconds. A bucket without spans has no entry.
type REDSeries struct {
	Requests map[int64]float64
	Errors   map[int64]float64
	P99      map[int64]float64
}

// REDResult is one RED query's response, by service.
type REDResult struct {
	Services map[string]*REDSeries
	Warnings []string
}

// NewDiscoveryRequest returns the k-th season's top max_series services by
// request count.
func NewDiscoveryRequest(window Window, k int, maxSeries int) *qbtypes.QueryRangeRequest {
	return newREDRequest(window, redScope, nil, maxSeries, k)
}

func NewCurrentRequest(window Window, services []string) *qbtypes.QueryRangeRequest {
	return newServicesRequest(window, services, 0)
}

// NewBaselineRequest returns the k-th season of the given services only.
func NewBaselineRequest(window Window, k int, services []string) *qbtypes.QueryRangeRequest {
	return newServicesRequest(window, services, k)
}

// ParseRED reads a RED response. Partial and non-finite values are dropped:
// they say nothing about a whole bucket.
func ParseRED(resp *qbtypes.QueryRangeResponse) *REDResult {
	result := &REDResult{Services: map[string]*REDSeries{}}
	if resp == nil {
		return result
	}
	if resp.Warning != nil {
		if resp.Warning.Message != "" {
			result.Warnings = append(result.Warnings, resp.Warning.Message)
		}
		for _, warning := range resp.Warning.Warnings {
			result.Warnings = append(result.Warnings, warning.Message)
		}
	}
	for _, raw := range resp.Data.Results {
		data, ok := raw.(*qbtypes.TimeSeriesData)
		if !ok || data.QueryName != redQueryName {
			continue
		}
		for _, bucket := range data.Aggregations {
			for _, series := range bucket.Series {
				service, ok := serviceOf(series)
				if !ok {
					continue
				}
				red, ok := result.Services[service]
				if !ok {
					red = &REDSeries{Requests: map[int64]float64{}, Errors: map[int64]float64{}, P99: map[int64]float64{}}
					result.Services[service] = red
				}
				red.add(bucket.Index, series.Values)
			}
		}
	}
	return result
}

func newServicesRequest(window Window, services []string, k int) *qbtypes.QueryRangeRequest {
	values := make([]any, len(services))
	for i, service := range services {
		values[i] = service
	}
	variables := map[string]qbtypes.VariableItem{servicesVariable: {Type: qbtypes.DynamicVariableType, Value: values}}
	return newREDRequest(window, "("+redScope+") AND service.name IN $"+servicesVariable, variables, len(services), k)
}

func newREDRequest(window Window, filter string, variables map[string]qbtypes.VariableItem, limit int, k int) *qbtypes.QueryRangeRequest {
	return &qbtypes.QueryRangeRequest{
		Start:          uint64(window.Start.UnixMilli()),
		End:            uint64(window.End.UnixMilli()),
		RequestType:    qbtypes.RequestTypeTimeSeries,
		Variables:      variables,
		CompositeQuery: qbtypes.CompositeQuery{Queries: []qbtypes.QueryEnvelope{{Type: qbtypes.QueryTypeBuilder, Spec: redQuery(filter, limit, k)}}},
	}
}

func redQuery(filter string, limit int, k int) qbtypes.QueryBuilderQuery[qbtypes.TraceAggregation] {
	query := qbtypes.QueryBuilderQuery[qbtypes.TraceAggregation]{
		Name:         redQueryName,
		Signal:       telemetrytypes.SignalTraces,
		StepInterval: qbtypes.Step{Duration: BucketStep},
		Filter:       &qbtypes.Filter{Expression: filter},
		GroupBy: []qbtypes.GroupByKey{{TelemetryFieldKey: telemetrytypes.TelemetryFieldKey{
			Name:          serviceLabel,
			FieldContext:  telemetrytypes.FieldContextResource,
			FieldDataType: telemetrytypes.FieldDataTypeString,
			Materialized:  true,
		}}},
		Aggregations: []qbtypes.TraceAggregation{
			{Expression: requestsExpression},
			{Expression: "countIf(status_code = 2)"},
			{Expression: "p99(duration_nano)"},
		},
		Order: []qbtypes.OrderBy{{Key: qbtypes.OrderByKey{TelemetryFieldKey: telemetrytypes.TelemetryFieldKey{Name: requestsExpression}}, Direction: qbtypes.OrderDirectionDesc}},
		Limit: limit,
	}
	if k > 0 {
		query.Functions = []qbtypes.Function{{Name: qbtypes.FunctionNameTimeShift, Args: []qbtypes.FunctionArg{{Value: SeasonShift(k)}}}}
	}
	return query
}

func serviceOf(series *qbtypes.TimeSeries) (string, bool) {
	for _, label := range series.Labels {
		if label.Key.Name == serviceLabel {
			service, ok := label.Value.(string)
			return service, ok && service != ""
		}
	}
	return "", false
}

func (red *REDSeries) add(aggregate int, values []*qbtypes.TimeSeriesValue) {
	var target map[int64]float64
	switch aggregate {
	case requestsAggregate:
		target = red.Requests
	case errorsAggregate:
		target = red.Errors
	case latencyAggregate:
		target = red.P99
	default:
		return
	}
	for _, value := range values {
		if value.Partial || math.IsNaN(value.Value) || math.IsInf(value.Value, 0) {
			continue
		}
		target[value.Timestamp] = value.Value
	}
}

// windowRequests is the request count of the window's buckets, and how many
// of them have spans.
func (red *REDSeries) windowRequests(window Window) (float64, int) {
	if red == nil {
		return 0, 0
	}
	total, present := 0.0, 0
	for _, timestamp := range window.Buckets() {
		if value, ok := red.Requests[timestamp]; ok {
			total += value
			present++
		}
	}
	return total, present
}
