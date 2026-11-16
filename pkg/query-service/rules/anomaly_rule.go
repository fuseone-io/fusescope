package rules

import (
	"context"
	"log/slog"
	"net/url"
	"strconv"
	"time"

	"github.com/fuseone-io/fusescope/pkg/anomaly"
	"github.com/fuseone-io/fusescope/pkg/anomaly/anomalyquerier"
	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/querier"
	qbtypes "github.com/fuseone-io/fusescope/pkg/types/querybuildertypes/querybuildertypesv5"
	"github.com/fuseone-io/fusescope/pkg/types/ruletypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
)

// maxAnomalyEvalTimeout bounds an anomaly evaluation, which runs five windows, so a slow one
// cannot hold back the rules after it in the task.
const maxAnomalyEvalTimeout = time.Minute

// anomalyRule is what makes a ThresholdRule an anomaly rule: it evaluates the anomaly scores of
// the selected query instead of its values.
type anomalyRule struct {
	evaluator *anomalyquerier.Evaluator
	timeout   time.Duration
}

// NewAnomalyRule is a threshold rule over the selected query's anomaly scores. It keeps the
// ThresholdRule type so task state, edits and restarts treat it as one.
func NewAnomalyRule(id string, orgID valuer.UUID, p *ruletypes.PostableRule, q querier.Querier, evaluator *anomalyquerier.Evaluator, logger *slog.Logger, externalURL *url.URL, opts ...RuleOption) (*ThresholdRule, error) {
	if evaluator == nil {
		return nil, errors.NewInternalf(errors.CodeInternal, "anomaly rules need an anomaly evaluator")
	}
	rule, err := NewThresholdRule(id, orgID, p, q, logger, externalURL, opts...)
	if err != nil {
		return nil, err
	}
	timeout := maxAnomalyEvalTimeout
	if evaluation, err := p.Evaluation.GetEvaluation(); err == nil {
		if frequency := evaluation.GetFrequency().Duration(); frequency > 0 {
			timeout = min(timeout, frequency)
		}
	}
	rule.anomaly = &anomalyRule{evaluator: evaluator, timeout: timeout}
	return rule, nil
}

// formatScore prints an anomaly score, which has no unit, to four significant digits.
func formatScore(score float64) string {
	return strconv.FormatFloat(score, 'g', 4, 64)
}

// runAnomaly evaluates params with the condition's target and seasonality, waiting for a slot
// within the rule's timeout, and returns the response with the selected query's scores filled.
func (r *ThresholdRule) runAnomaly(ctx context.Context, orgID valuer.UUID, params *qbtypes.QueryRangeRequest) (*anomalyquerier.Evaluation, error) {
	ctx, cancel := context.WithTimeout(ctx, r.anomaly.timeout)
	defer cancel()
	params.CompositeQuery.Queries = r.withConditionArgs(params.CompositeQuery.Queries)
	return r.anomaly.evaluator.Evaluate(ctx, orgID, params, anomalyquerier.Options{Admission: anomalyquerier.Wait})
}

// withConditionArgs copies queries with every anomaly function's arguments taken from the
// condition, so the bands and what fires never disagree.
func (r *ThresholdRule) withConditionArgs(queries []qbtypes.QueryEnvelope) []qbtypes.QueryEnvelope {
	out := make([]qbtypes.QueryEnvelope, len(queries))
	condition := r.Condition()
	args := []qbtypes.FunctionArg{{Name: "seasonality", Value: condition.Seasonality.StringValue()}}
	if condition.Target != nil {
		args = append(args, qbtypes.FunctionArg{Name: "z_score_threshold", Value: *condition.Target})
	}
	for i, envelope := range queries {
		out[i] = envelope.Copy()
		spec, ok := out[i].Spec.(qbtypes.QueryBuilderQuery[qbtypes.MetricAggregation])
		if !ok {
			continue
		}
		for j, fn := range spec.Functions {
			if fn.Name == qbtypes.FunctionNameAnomaly {
				spec.Functions[j].Args = args
			}
		}
		out[i].Spec = spec
	}
	return out
}

// annotateFlatBaselines marks the samples of series scored against a flat baseline.
func annotateFlatBaselines(samples ruletypes.Vector, series *qbtypes.TimeSeries, perSeries map[string]anomaly.SeriesStatus) error {
	key, err := anomaly.LabelsKey(series.Labels)
	if err != nil {
		return err
	}
	if !perSeries[key].FlatBaseline {
		return nil
	}
	for i := range samples {
		if samples[i].ExtraAnnotations == nil {
			samples[i].ExtraAnnotations = map[string]string{}
		}
		samples[i].ExtraAnnotations[ruletypes.AnnotationAnomalyBaseline] = "flat"
	}
	return nil
}
