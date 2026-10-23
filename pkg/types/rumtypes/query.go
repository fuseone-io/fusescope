package rumtypes

import (
	"time"

	"github.com/fuseone-io/fusescope/pkg/errors"
)

const (
	MaxQueryRange      = 31 * 24 * time.Hour
	defaultQueryRange  = 24 * time.Hour
	defaultPageLimit   = 50
	maxPageOffset      = 10000
	maxFilterLength    = 256
	maxSeriesBuckets   = 32
	ErrorHistoryWindow = 30 * 24 * time.Hour
)

var ErrCodeQueryInvalidInput = errors.MustNewCode("rum_query_invalid_input")

var seriesSteps = []time.Duration{time.Minute, 5 * time.Minute, 10 * time.Minute, 15 * time.Minute, 30 * time.Minute, time.Hour, 3 * time.Hour, 6 * time.Hour, 12 * time.Hour, 24 * time.Hour}

// QueryableRange is the time range and the resource filters every RUM query takes.
type QueryableRange struct {
	Start       int64  `query:"start" description:"Unix milliseconds. Defaults to 24 hours before end."`
	End         int64  `query:"end" description:"Unix milliseconds. Defaults to now."`
	Release     string `query:"release" description:"Keep telemetry whose service.version equals this."`
	Environment string `query:"environment" description:"Keep telemetry whose deployment.environment.name equals this."`
}

type ListViewsParams struct {
	QueryableRange
	Limit int `query:"limit" description:"Routes to return, 1 to 500, by view count. Defaults to 100."`
}

type GetViewParams struct {
	QueryableRange
}

type ListErrorGroupsParams struct {
	QueryableRange
	Limit  int `query:"limit" description:"Groups per page, 1 to 200, by event count. Defaults to 50."`
	Offset int `query:"offset"`
}

type GetErrorGroupParams struct {
	QueryableRange
	EventID string `query:"eventId" description:"Event whose breadcrumbs and linked request are returned. Defaults to the latest."`
}

type ListSessionsParams struct {
	QueryableRange
	Browser       string `query:"browser" description:"Browser name as returned in client.browser, e.g. Chrome."`
	Route         string `query:"route" description:"Keep sessions with a view on this route template."`
	UserID        string `query:"userId" description:"Matches user.id or user.hash."`
	HasError      *bool  `query:"hasError" description:"true keeps sessions with an error, false those without."`
	MinDurationMs *int64 `query:"minDurationMs"`
	MaxDurationMs *int64 `query:"maxDurationMs"`
	Limit         int    `query:"limit" description:"Sessions per page, 1 to 200, newest first. Defaults to 50."`
	Offset        int    `query:"offset"`
}

type GetSessionParams struct {
	QueryableRange
}

type QueryRange struct {
	Start       time.Time
	End         time.Time
	Release     string
	Environment string
}

type Page struct {
	Limit  int
	Offset int
}

type SessionFilter struct {
	Browser     string
	Route       string
	UserID      string
	HasError    *bool
	MinDuration time.Duration
	MaxDuration time.Duration
}

func NewQueryRange(params QueryableRange, now time.Time) (QueryRange, error) {
	if params.Start < 0 || params.End < 0 {
		return QueryRange{}, errors.NewInvalidInputf(ErrCodeQueryInvalidInput, "start and end must be positive unix milliseconds")
	}
	if len(params.Release) > maxFilterLength || len(params.Environment) > maxFilterLength {
		return QueryRange{}, errors.NewInvalidInputf(ErrCodeQueryInvalidInput, "release and environment must be at most %d characters", maxFilterLength)
	}

	end := now
	if params.End > 0 {
		end = time.UnixMilli(params.End).UTC()
	}
	start := end.Add(-defaultQueryRange)
	if params.Start > 0 {
		start = time.UnixMilli(params.Start).UTC()
	}

	if !start.Before(end) {
		return QueryRange{}, errors.NewInvalidInputf(ErrCodeQueryInvalidInput, "start must be before end")
	}
	if end.Sub(start) > MaxQueryRange {
		return QueryRange{}, errors.NewInvalidInputf(ErrCodeQueryInvalidInput, "the time range must be at most %d days", int(MaxQueryRange.Hours()/24))
	}

	return QueryRange{Start: start, End: end, Release: params.Release, Environment: params.Environment}, nil
}

func NewPage(limit int, offset int, maxLimit int) (Page, error) {
	if limit == 0 {
		limit = min(defaultPageLimit, maxLimit)
	}
	if limit < 1 || limit > maxLimit {
		return Page{}, errors.NewInvalidInputf(ErrCodeQueryInvalidInput, "limit must be between 1 and %d", maxLimit)
	}
	if offset < 0 || offset > maxPageOffset {
		return Page{}, errors.NewInvalidInputf(ErrCodeQueryInvalidInput, "offset must be between 0 and %d", maxPageOffset)
	}
	return Page{Limit: limit, Offset: offset}, nil
}

// NewSeriesStep picks the smallest round step that splits span into at most
// 32 buckets.
func NewSeriesStep(span time.Duration) time.Duration {
	for _, step := range seriesSteps {
		if span <= step*maxSeriesBuckets {
			return step
		}
	}
	return seriesSteps[len(seriesSteps)-1]
}

func (params ListSessionsParams) Filter() (SessionFilter, error) {
	for _, value := range []string{params.Browser, params.Route, params.UserID} {
		if len(value) > maxFilterLength {
			return SessionFilter{}, errors.NewInvalidInputf(ErrCodeQueryInvalidInput, "filters must be at most %d characters", maxFilterLength)
		}
	}

	filter := SessionFilter{Browser: params.Browser, Route: params.Route, UserID: params.UserID, HasError: params.HasError}
	if params.MinDurationMs != nil {
		filter.MinDuration = time.Duration(*params.MinDurationMs) * time.Millisecond
	}
	if params.MaxDurationMs != nil {
		filter.MaxDuration = time.Duration(*params.MaxDurationMs) * time.Millisecond
	}
	if filter.MinDuration < 0 || filter.MaxDuration < 0 || (filter.MaxDuration > 0 && filter.MinDuration > filter.MaxDuration) {
		return SessionFilter{}, errors.NewInvalidInputf(ErrCodeQueryInvalidInput, "minDurationMs and maxDurationMs must be positive, min at most max")
	}
	return filter, nil
}
