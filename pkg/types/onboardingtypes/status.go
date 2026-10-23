package onboardingtypes

import (
	"slices"
	"strings"
	"time"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/valuer"
)

const (
	DefaultStatusWindow = time.Hour
	MaxStatusWindow     = 24 * time.Hour
	maxServiceLength    = 256
)

var ErrCodeInvalidStatusQuery = errors.MustNewCode("onboarding_invalid_status_query")

var (
	SignalTraces  = Signal{valuer.NewString("traces")}
	SignalMetrics = Signal{valuer.NewString("metrics")}
	SignalLogs    = Signal{valuer.NewString("logs")}

	signals = []Signal{SignalTraces, SignalMetrics, SignalLogs}
)

type Signal struct{ valuer.String }

type QueryableStatus struct {
	Signals string `query:"signals" description:"Comma-separated subset of traces, metrics and logs. Defaults to all three."`
	Service string `query:"service" description:"Keep telemetry whose service.name equals this."`
	Since   int64  `query:"since" description:"Unix milliseconds. Defaults to an hour ago; anything earlier than 24 hours ago is raised to it."`
}

type StatusQuery struct {
	Signals []Signal
	Service string
	Since   time.Time
	Until   time.Time
}

type SignalStatus struct {
	Received  bool   `json:"received" required:"true"`
	Count     uint64 `json:"count" required:"true" description:"Spans, metric samples or log records in the window."`
	FirstSeen *int64 `json:"firstSeen" required:"true" nullable:"true" description:"Unix milliseconds of the earliest item in the window."`
	LastSeen  *int64 `json:"lastSeen" required:"true" nullable:"true" description:"Unix milliseconds of the latest item in the window."`
}

type TracesStatus struct {
	SignalStatus
	Operations uint64 `json:"operations" required:"true" description:"Distinct span names."`
}

type MetricsStatus struct {
	SignalStatus
	Series uint64 `json:"series" required:"true" description:"Distinct time series."`
}

type Status struct {
	Since   int64          `json:"since" required:"true" description:"Unix milliseconds the window starts at, after defaulting and capping."`
	Until   int64          `json:"until" required:"true" description:"Unix milliseconds the window ends at."`
	Service *string        `json:"service" required:"true" nullable:"true"`
	Traces  *TracesStatus  `json:"traces" required:"true" nullable:"true" description:"Null when not requested."`
	Metrics *MetricsStatus `json:"metrics" required:"true" nullable:"true" description:"Null when not requested. FuseScope's own signoz_* and the collector's otelcol_* metrics are not counted."`
	Logs    *SignalStatus  `json:"logs" required:"true" nullable:"true" description:"Null when not requested."`
}

func (Signal) Enum() []any {
	return []any{SignalTraces, SignalMetrics, SignalLogs}
}

func NewStatusQuery(params QueryableStatus, now time.Time) (StatusQuery, error) {
	if len(params.Service) > maxServiceLength {
		return StatusQuery{}, errors.NewInvalidInputf(ErrCodeInvalidStatusQuery, "service must be at most %d characters", maxServiceLength)
	}
	if params.Since < 0 {
		return StatusQuery{}, errors.NewInvalidInputf(ErrCodeInvalidStatusQuery, "since must be positive unix milliseconds")
	}

	requested := signals
	if strings.TrimSpace(params.Signals) != "" {
		requested = []Signal{}
		for _, name := range strings.Split(params.Signals, ",") {
			index := slices.IndexFunc(signals, func(signal Signal) bool { return signal.StringValue() == strings.TrimSpace(name) })
			if index < 0 {
				return StatusQuery{}, errors.NewInvalidInputf(ErrCodeInvalidStatusQuery, "unknown signal %q, expected traces, metrics or logs", strings.TrimSpace(name))
			}
			requested = append(requested, signals[index])
		}
		requested = slices.DeleteFunc(slices.Clone(signals), func(signal Signal) bool { return !slices.Contains(requested, signal) })
	}

	since := now.Add(-DefaultStatusWindow)
	if params.Since > 0 {
		since = time.UnixMilli(params.Since).UTC()
	}
	if since.After(now) {
		return StatusQuery{}, errors.NewInvalidInputf(ErrCodeInvalidStatusQuery, "since must not be in the future")
	}
	if since.Before(now.Add(-MaxStatusWindow)) {
		since = now.Add(-MaxStatusWindow)
	}

	return StatusQuery{Signals: requested, Service: params.Service, Since: since, Until: now}, nil
}

func NewStatus(query StatusQuery) *Status {
	status := &Status{Since: query.Since.UnixMilli(), Until: query.Until.UnixMilli()}
	if query.Service != "" {
		service := query.Service
		status.Service = &service
	}

	return status
}

// NewSignalStatus takes unix milliseconds and ignores them when count is
// zero, as min and max over no rows are zero values in ClickHouse.
func NewSignalStatus(count uint64, firstSeen, lastSeen int64) SignalStatus {
	if count == 0 {
		return SignalStatus{}
	}

	return SignalStatus{Received: true, Count: count, FirstSeen: &firstSeen, LastSeen: &lastSeen}
}
