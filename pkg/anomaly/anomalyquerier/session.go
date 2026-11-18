package anomalyquerier

import (
	"context"
	"sync"
	"time"

	"github.com/fuseone-io/fusescope/pkg/anomaly"
	"github.com/fuseone-io/fusescope/pkg/errors"
	qbtypes "github.com/fuseone-io/fusescope/pkg/types/querybuildertypes/querybuildertypesv5"
	"github.com/fuseone-io/fusescope/pkg/valuer"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/metric"
)

var ErrCodeSessionClosed = errors.MustNewCode("anomaly_session_closed")

// Session holds one evaluation slot and runs plain query range requests under the evaluator's
// limits: max_series on each response and max_points on everything the session materialised.
type Session struct {
	evaluator *Evaluator
	release   func()

	mu       sync.Mutex
	closed   bool
	points   int
	exceeded error
}

// Admit takes one of the slots Evaluate uses. The caller must Close the session.
func (e *Evaluator) Admit(ctx context.Context, admission Admission) (*Session, error) {
	release, err := e.admit(ctx, admission)
	if err != nil {
		e.recordSession(ctx, err)
		return nil, err
	}
	return &Session{evaluator: e, release: release}, nil
}

// Close releases the slot; later calls do nothing.
func (s *Session) Close() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if !s.closed {
		s.closed = true
		s.release()
	}
}

// Run executes a copy of req on the wrapped querier and returns its response as is. timeShift
// results come back on the current timeline, as the querier aligns them. A session past either
// limit refuses every later request without querying.
func (s *Session) Run(ctx context.Context, orgID valuer.UUID, req *qbtypes.QueryRangeRequest) (*qbtypes.QueryRangeResponse, error) {
	resp, err := s.run(ctx, orgID, req)
	s.evaluator.recordSession(ctx, err)
	return resp, err
}

func (s *Session) run(ctx context.Context, orgID valuer.UUID, req *qbtypes.QueryRangeRequest) (*qbtypes.QueryRangeResponse, error) {
	if err := validateSessionRequest(req); err != nil {
		return nil, err
	}
	if err := s.usable(); err != nil {
		return nil, err
	}

	started := time.Now()
	resp, err := s.evaluator.querier.QueryRange(ctx, orgID, copyRequest(req))
	s.evaluator.duration.Record(ctx, time.Since(started).Seconds(), metric.WithAttributes(attribute.String("stage", "session")))
	if err != nil {
		return nil, err
	}

	series, points, err := measure(resp)
	if err != nil {
		return nil, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.points += points
	if err := s.evaluator.checkSeries(series); err != nil {
		s.exceeded = err
		return nil, err
	}
	if err := s.evaluator.checkPoints(s.points); err != nil {
		s.exceeded = err
		return nil, err
	}
	return resp, nil
}

func (s *Session) usable() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed {
		return errors.Newf(errors.TypeInternal, ErrCodeSessionClosed, "the anomaly session is closed")
	}
	return s.exceeded
}

func (e *Evaluator) recordSession(ctx context.Context, err error) {
	e.evaluations.Add(ctx, 1, metric.WithAttributes(attribute.String("outcome", outcomeOf(ctx, err)), attribute.String("kind", "session")))
}

// validateSessionRequest keeps Run to requests whose size the limits can measure, and away from
// the anomaly function, which only Evaluate scores.
func validateSessionRequest(req *qbtypes.QueryRangeRequest) error {
	if req.RequestType != qbtypes.RequestTypeTimeSeries {
		return errors.Newf(errors.TypeInvalidInput, anomaly.ErrCodeInvalidRequest, "an anomaly session runs time_series requests, not %s", req.RequestType.StringValue())
	}
	if len(req.FindFunctions(qbtypes.FunctionNameAnomaly)) > 0 {
		return errors.Newf(errors.TypeInvalidInput, anomaly.ErrCodeInvalidRequest, "an anomaly session does not evaluate the anomaly function")
	}
	return nil
}

// measure returns the most label sets of any one query result, a label set counted once however
// many aggregations it has, and every point or aggregation cell of the response.
func measure(resp *qbtypes.QueryRangeResponse) (int, int, error) {
	if resp == nil {
		return 0, 0, nil
	}
	maxSeries, points := 0, 0
	for _, result := range resp.Data.Results {
		series := 0
		switch data := result.(type) {
		case *qbtypes.TimeSeriesData:
			keys := map[string]struct{}{}
			for _, bucket := range data.Aggregations {
				for _, s := range bucket.Series {
					key, err := anomaly.LabelsKey(s.Labels)
					if err != nil {
						return 0, 0, err
					}
					keys[key] = struct{}{}
				}
				points += countPoints(bucket.Series)
			}
			series = len(keys)
		}
		maxSeries = max(maxSeries, series)
	}
	return maxSeries, points, nil
}
