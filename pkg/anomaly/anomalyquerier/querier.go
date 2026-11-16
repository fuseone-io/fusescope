package anomalyquerier

import (
	"context"

	"github.com/fuseone-io/fusescope/pkg/querier"
	qbtypes "github.com/fuseone-io/fusescope/pkg/types/querybuildertypes/querybuildertypesv5"
	"github.com/fuseone-io/fusescope/pkg/valuer"
)

// Querier evaluates the anomaly function of interactive query range requests and passes
// everything else to the querier it wraps.
type Querier struct {
	querier.Querier
	evaluator *Evaluator
}

var _ querier.Querier = (*Querier)(nil)

func NewQuerier(q querier.Querier, evaluator *Evaluator) *Querier {
	return &Querier{Querier: q, evaluator: evaluator}
}

func (q *Querier) QueryRange(ctx context.Context, orgID valuer.UUID, req *qbtypes.QueryRangeRequest) (*qbtypes.QueryRangeResponse, error) {
	if len(req.FindFunctions(qbtypes.FunctionNameAnomaly)) == 0 {
		return q.Querier.QueryRange(ctx, orgID, req)
	}
	evaluation, err := q.evaluator.Evaluate(ctx, orgID, req, Options{Admission: FailFast})
	if err != nil {
		return nil, err
	}
	return evaluation.Response, nil
}
