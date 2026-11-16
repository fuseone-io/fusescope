// Package anomalyquerier evaluates the anomaly function of a query range request: it runs the
// request, then the target query alone over four earlier seasons, and scores the current window
// against them.
package anomalyquerier

import (
	"context"
	"maps"
	"sync"
	"time"

	"github.com/fuseone-io/fusescope/pkg/anomaly"
	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/factory"
	"github.com/fuseone-io/fusescope/pkg/querier"
	qbtypes "github.com/fuseone-io/fusescope/pkg/types/querybuildertypes/querybuildertypesv5"
	"github.com/fuseone-io/fusescope/pkg/valuer"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/metric"
	"golang.org/x/sync/errgroup"
)

// Admission is what an evaluation does when every slot is taken.
type Admission int

const (
	// FailFast refuses with too-many-requests: interactive requests.
	FailFast Admission = iota
	// Wait waits for a slot until the context ends: rule evaluations.
	Wait
)

const (
	outcomeOK            = "ok"
	outcomeInvalidInput  = "invalid_input"
	outcomeLimitExceeded = "limit_exceeded"
	outcomeBusy          = "busy"
	outcomeTimeout       = "timeout"
	outcomeError         = "error"
)

var (
	ErrCodeLimitExceeded = errors.MustNewCode("anomaly_point_limit_exceeded")
	ErrCodeBusy          = errors.MustNewCode("anomaly_busy")
)

type Options struct {
	Admission Admission
}

// Evaluation is the public response, with the target's bucket filled, and what the scorer did.
type Evaluation struct {
	Response  *qbtypes.QueryRangeResponse
	Outcomes  map[anomaly.Reason]int
	PerSeries map[string]anomaly.SeriesStatus
}

// Evaluator is shared by every caller of a process, so its slots bound them together.
type Evaluator struct {
	querier     querier.Querier
	config      anomaly.Config
	slots       chan struct{}
	points      metric.Int64Counter
	evaluations metric.Int64Counter
	duration    metric.Float64Histogram
}

func NewEvaluator(providerSettings factory.ProviderSettings, q querier.Querier, config anomaly.Config) (*Evaluator, error) {
	settings := factory.NewScopedProviderSettings(providerSettings, "github.com/fuseone-io/fusescope/pkg/anomaly/anomalyquerier")
	meter := settings.Meter()
	points, err := meter.Int64Counter("fusescope.anomaly.points", metric.WithDescription("Current points of anomaly evaluations, by outcome."))
	if err != nil {
		return nil, err
	}
	evaluations, err := meter.Int64Counter("fusescope.anomaly.evaluations", metric.WithDescription("Anomaly evaluations, by outcome."))
	if err != nil {
		return nil, err
	}
	duration, err := meter.Float64Histogram("fusescope.anomaly.duration", metric.WithUnit("s"), metric.WithDescription("Duration of each stage of an anomaly evaluation."))
	if err != nil {
		return nil, err
	}
	return &Evaluator{querier: q, config: config, slots: make(chan struct{}, config.MaxConcurrent), points: points, evaluations: evaluations, duration: duration}, nil
}

// Evaluate runs req, whose one anomaly function names the target, and scores the target.
func (e *Evaluator) Evaluate(ctx context.Context, orgID valuer.UUID, req *qbtypes.QueryRangeRequest, opts Options) (*Evaluation, error) {
	evaluation, err := e.evaluate(ctx, orgID, req, opts)
	e.evaluations.Add(ctx, 1, metric.WithAttributes(attribute.String("outcome", outcomeOf(ctx, err))))
	if err == nil {
		for reason, n := range evaluation.Outcomes {
			e.points.Add(ctx, int64(n), metric.WithAttributes(attribute.String("reason", string(reason))))
		}
	}
	return evaluation, err
}

func (e *Evaluator) evaluate(ctx context.Context, orgID valuer.UUID, req *qbtypes.QueryRangeRequest, opts Options) (*Evaluation, error) {
	target, found, err := anomaly.FindTarget(req)
	if err != nil {
		return nil, err
	}
	if !found {
		return nil, errors.Newf(errors.TypeInvalidInput, anomaly.ErrCodeInvalidRequest, "the request has no anomaly function")
	}
	release, err := e.admit(ctx, opts.Admission)
	if err != nil {
		return nil, err
	}
	defer release()

	started := time.Now()
	resp, err := e.querier.QueryRange(ctx, orgID, currentRequest(req, target))
	e.duration.Record(ctx, time.Since(started).Seconds(), metric.WithAttributes(attribute.String("stage", "current")))
	if err != nil {
		return nil, err
	}
	bucket := targetBucket(resp, target.Spec.Name)
	if bucket == nil || len(bucket.Series) == 0 {
		return &Evaluation{Response: resp, Outcomes: map[anomaly.Reason]int{}, PerSeries: map[string]anomaly.SeriesStatus{}}, nil
	}

	currentPoints := countPoints(bucket.Series)
	if err := e.checkWindow(len(bucket.Series), currentPoints); err != nil {
		return nil, err
	}
	if hasEligiblePoint(bucket.Series) {
		if err := e.checkPoints(anomaly.Seasons*currentPoints + currentPoints); err != nil {
			return nil, err
		}
	}

	var baselines [][]*qbtypes.TimeSeries
	if hasEligiblePoint(bucket.Series) {
		started = time.Now()
		var responses []*qbtypes.QueryRangeResponse
		baselines, responses, err = e.runBaselines(ctx, orgID, req, target, currentPoints)
		e.duration.Record(ctx, time.Since(started).Seconds(), metric.WithAttributes(attribute.String("stage", "baselines")))
		if err != nil {
			return nil, err
		}
		mergeBaselines(resp, responses)
	}

	started = time.Now()
	scored, err := anomaly.Score(bucket.Series, baselines, target.Args.Target)
	e.duration.Record(ctx, time.Since(started).Seconds(), metric.WithAttributes(attribute.String("stage", "score")))
	if err != nil {
		return nil, err
	}
	bucket.PredictedSeries, bucket.UpperBoundSeries, bucket.LowerBoundSeries, bucket.AnomalyScores = scored.Predicted, scored.Upper, scored.Lower, scored.Scores
	return &Evaluation{Response: resp, Outcomes: scored.Outcomes, PerSeries: scored.PerSeries}, nil
}

func (e *Evaluator) admit(ctx context.Context, admission Admission) (func(), error) {
	release := func() { <-e.slots }
	if admission == FailFast {
		select {
		case e.slots <- struct{}{}:
			return release, nil
		default:
			return nil, errors.Newf(errors.TypeTooManyRequests, ErrCodeBusy, "too many anomaly evaluations are running, retry shortly")
		}
	}
	select {
	case e.slots <- struct{}{}:
		return release, nil
	case <-ctx.Done():
		return nil, ctx.Err()
	}
}

// runBaselines runs the target alone in each earlier season, in parallel. The first window past
// a limit cancels the others; every point a baseline materialised counts, before any is dropped.
func (e *Evaluator) runBaselines(ctx context.Context, orgID valuer.UUID, req *qbtypes.QueryRangeRequest, target *anomaly.Target, currentPoints int) ([][]*qbtypes.TimeSeries, []*qbtypes.QueryRangeResponse, error) {
	baselines := make([][]*qbtypes.TimeSeries, anomaly.Seasons)
	responses := make([]*qbtypes.QueryRangeResponse, anomaly.Seasons)
	var mu sync.Mutex
	total := currentPoints
	group, groupCtx := errgroup.WithContext(ctx)
	for i := range anomaly.Seasons {
		group.Go(func() error {
			shift := int64(i+1) * int64(target.Args.Seasonality.Period()/time.Second)
			resp, err := e.querier.QueryRange(groupCtx, orgID, baselineRequest(req, target, shift))
			if err != nil {
				return err
			}
			responses[i] = resp
			bucket := targetBucket(resp, target.Spec.Name)
			if bucket == nil {
				return nil
			}
			points := countPoints(bucket.Series)
			if err := e.checkWindow(len(bucket.Series), points); err != nil {
				return err
			}
			mu.Lock()
			defer mu.Unlock()
			total += points
			if err := e.checkPoints(total); err != nil {
				return err
			}
			baselines[i] = bucket.Series
			return nil
		})
	}
	if err := group.Wait(); err != nil {
		return nil, nil, err
	}
	return baselines, responses, nil
}

// mergeBaselines adds what the baselines scanned to resp and their warnings once each, so the
// response accounts for the whole evaluation.
func mergeBaselines(resp *qbtypes.QueryRangeResponse, baselines []*qbtypes.QueryRangeResponse) {
	seen := map[string]bool{}
	if resp.Warning != nil {
		for _, w := range resp.Warning.Warnings {
			seen[w.Message] = true
		}
	}
	for _, baseline := range baselines {
		if baseline == nil {
			continue
		}
		resp.Meta.RowsScanned += baseline.Meta.RowsScanned
		resp.Meta.BytesScanned += baseline.Meta.BytesScanned
		resp.Meta.DurationMS += baseline.Meta.DurationMS
		if baseline.Warning == nil {
			continue
		}
		if resp.Warning == nil {
			resp.Warning = &qbtypes.QueryWarnData{Message: baseline.Warning.Message, Url: baseline.Warning.Url}
		}
		for _, w := range baseline.Warning.Warnings {
			if !seen[w.Message] {
				seen[w.Message] = true
				resp.Warning.Warnings = append(resp.Warning.Warnings, w)
			}
		}
	}
}

func (e *Evaluator) checkWindow(series, points int) error {
	if series > e.config.MaxSeries {
		return errors.Newf(errors.TypePayloadTooLarge, ErrCodeLimitExceeded, "an anomaly window returned %d series, above the limit of %d", series, e.config.MaxSeries)
	}
	return e.checkPoints(points)
}

func (e *Evaluator) checkPoints(points int) error {
	if points > e.config.MaxPoints {
		return errors.Newf(errors.TypePayloadTooLarge, ErrCodeLimitExceeded, "an anomaly evaluation needs %d points, above the limit of %d", points, e.config.MaxPoints)
	}
	return nil
}

// currentRequest is req with the target's step fixed, its anomaly function dropped and the cache
// off. Every query is deep-copied: the querier adjusts steps and resolves metadata in place.
func currentRequest(req *qbtypes.QueryRangeRequest, target *anomaly.Target) *qbtypes.QueryRangeRequest {
	out := *req
	out.Start, out.End = target.Start, target.End
	out.NoCache = true
	out.Variables = maps.Clone(req.Variables)
	out.CompositeQuery.Queries = make([]qbtypes.QueryEnvelope, len(req.CompositeQuery.Queries))
	for i, envelope := range req.CompositeQuery.Queries {
		out.CompositeQuery.Queries[i] = envelope.Copy()
	}
	out.CompositeQuery.Queries[target.QueryIndex].Spec = targetSpec(target, nil)
	return &out
}

// baselineRequest is the target alone, its anomaly function replaced by timeShift(shift).
func baselineRequest(req *qbtypes.QueryRangeRequest, target *anomaly.Target, shift int64) *qbtypes.QueryRangeRequest {
	timeShift := qbtypes.Function{Name: qbtypes.FunctionNameTimeShift, Args: []qbtypes.FunctionArg{{Value: shift}}}
	return &qbtypes.QueryRangeRequest{
		SchemaVersion:  req.SchemaVersion,
		Start:          target.Start,
		End:            target.End,
		RequestType:    qbtypes.RequestTypeTimeSeries,
		Variables:      maps.Clone(req.Variables),
		CompositeQuery: qbtypes.CompositeQuery{Queries: []qbtypes.QueryEnvelope{{Type: qbtypes.QueryTypeBuilder, Spec: targetSpec(target, &timeShift)}}},
	}
}

func targetSpec(target *anomaly.Target, last *qbtypes.Function) qbtypes.QueryBuilderQuery[qbtypes.MetricAggregation] {
	spec := target.Spec.Copy()
	spec.StepInterval = qbtypes.Step{Duration: target.Step}
	spec.Functions = spec.Functions[:len(spec.Functions)-1]
	if last != nil {
		spec.Functions = append(spec.Functions, *last)
	}
	return spec
}

func targetBucket(resp *qbtypes.QueryRangeResponse, name string) *qbtypes.AggregationBucket {
	if resp == nil {
		return nil
	}
	for _, result := range resp.Data.Results {
		data, ok := result.(*qbtypes.TimeSeriesData)
		if ok && data.QueryName == name && len(data.Aggregations) > 0 {
			return data.Aggregations[0]
		}
	}
	return nil
}

func countPoints(series []*qbtypes.TimeSeries) int {
	n := 0
	for _, s := range series {
		n += len(s.Values)
	}
	return n
}

func hasEligiblePoint(series []*qbtypes.TimeSeries) bool {
	for _, s := range series {
		if len(s.EvaluableValues()) > 0 {
			return true
		}
	}
	return false
}

func outcomeOf(ctx context.Context, err error) string {
	switch {
	case err == nil:
		return outcomeOK
	case errors.Ast(err, errors.TypeInvalidInput):
		return outcomeInvalidInput
	case errors.Ast(err, errors.TypePayloadTooLarge):
		return outcomeLimitExceeded
	case errors.Ast(err, errors.TypeTooManyRequests):
		return outcomeBusy
	case errors.Ast(err, errors.TypeTimeout), errors.Is(err, context.DeadlineExceeded), ctx.Err() != nil:
		return outcomeTimeout
	}
	return outcomeError
}
