package ruletypes

import (
	"github.com/fuseone-io/fusescope/pkg/errors"
	qbtypes "github.com/fuseone-io/fusescope/pkg/types/querybuildertypes/querybuildertypesv5"
)

const (
	AnomalyAlgorithmStandard = "standard"
	// AnnotationAnomalyBaseline is set on an anomaly alert scored against a flat baseline, and is
	// reserved in anomaly rules.
	AnnotationAnomalyBaseline = "anomaly_baseline"

	anomalyMinTarget = 1
	anomalyMaxTarget = 7
)

func (r *PostableRule) processAnomalyDefaults() {
	if r.RuleCondition == nil {
		return
	}
	if r.RuleCondition.Algorithm == "" {
		r.RuleCondition.Algorithm = AnomalyAlgorithmStandard
	}
	if r.RuleCondition.Seasonality.IsZero() {
		r.RuleCondition.Seasonality = SeasonalityHourly
	}
}

func (r *PostableRule) validateAnomaly() []error {
	if r.SchemaVersion == SchemaVersionV2Alpha1 {
		return []error{errors.NewInvalidInputf(errors.CodeInvalidInput, "ruleType: anomaly_rule supports schemaVersion v1, not v2alpha1")}
	}
	var errs []error
	if r.RuleCondition.Algorithm != AnomalyAlgorithmStandard {
		errs = append(errs, errors.NewInvalidInputf(errors.CodeInvalidInput, "condition.algorithm: unsupported value %q; must be %q", r.RuleCondition.Algorithm, AnomalyAlgorithmStandard))
	}
	if target := r.RuleCondition.Target; target != nil && (*target < anomalyMinTarget || *target > anomalyMaxTarget) {
		errs = append(errs, errors.NewInvalidInputf(errors.CodeInvalidInput, "condition.target: an anomaly rule's z-score must be between %d and %d, got %v", anomalyMinTarget, anomalyMaxTarget, *target))
	}
	if _, reserved := r.Annotations[AnnotationAnomalyBaseline]; reserved {
		errs = append(errs, errors.NewInvalidInputf(errors.CodeInvalidInput, "annotations: %s is set by anomaly rules", AnnotationAnomalyBaseline))
	}
	if r.RuleCondition.CompositeQuery == nil {
		return errs
	}
	req := qbtypes.QueryRangeRequest{CompositeQuery: qbtypes.CompositeQuery{Queries: r.RuleCondition.CompositeQuery.Queries}}
	occurrences := req.FindFunctions(qbtypes.FunctionNameAnomaly)
	if len(occurrences) != 1 {
		return append(errs, errors.NewInvalidInputf(errors.CodeInvalidInput, "condition.compositeQuery: an anomaly rule needs exactly one anomaly function, found %d", len(occurrences)))
	}
	selected := r.RuleCondition.SelectedQuery
	if selected == "" {
		selected = r.RuleCondition.SelectedQueryName()
	}
	if selected != occurrences[0].QueryName {
		errs = append(errs, errors.NewInvalidInputf(errors.CodeInvalidInput, "condition.selectedQueryName: %q must be the query holding the anomaly function, %q", selected, occurrences[0].QueryName))
	}
	return errs
}
