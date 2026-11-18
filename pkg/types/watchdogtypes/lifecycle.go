package watchdogtypes

import (
	"time"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/types"
	"github.com/fuseone-io/fusescope/pkg/valuer"
)

const (
	// CleanEvaluationsToResolve consecutive clean evaluations, skipping
	// no-data, resolve a RED issue.
	CleanEvaluationsToResolve = 3
	// ReopenWindow is how long after its resolution a recurrence reopens
	// an issue instead of creating one.
	ReopenWindow = time.Hour
)

var (
	ErrCodeInvalidEvaluation = errors.MustNewCode("watchdog_invalid_evaluation")
)

var (
	OutcomeAnomalous = Outcome{valuer.NewString("anomalous")}
	OutcomeClean     = Outcome{valuer.NewString("clean")}
	// OutcomeNoData covers every evaluation that could not decide: outside
	// the cohort, too few scored buckets, no baseline, below the volume
	// gate, a timeout, an error or a skipped organization.
	OutcomeNoData = Outcome{valuer.NewString("no_data")}
)

var (
	TransitionNone     = Transition{valuer.NewString("none")}
	TransitionCreated  = Transition{valuer.NewString("created")}
	TransitionUpdated  = Transition{valuer.NewString("updated")}
	TransitionResolved = Transition{valuer.NewString("resolved")}
	TransitionReopened = Transition{valuer.NewString("reopened")}
	TransitionUnmuted  = Transition{valuer.NewString("unmuted")}
)

type Outcome struct{ valuer.String }

type Transition struct{ valuer.String }

// Evaluation is one detector's verdict on one service, or exception group,
// for the window ending at End. End identifies the evaluation: applying the
// same End twice changes nothing.
type Evaluation struct {
	OrgID    valuer.UUID
	Detector Detector
	Service  string
	GroupID  string
	Outcome  Outcome
	End      time.Time
	// Evidence and PeakScore are read only when anomalous; new_exception
	// has no score.
	Evidence  *Evidence
	PeakScore *float64
	Now       time.Time
}

// Change is the result of applying an evaluation. Issue is the state to
// persist, or the unchanged input for TransitionNone. Notify says whether the
// transition is one a detector with notify enabled reports.
type Change struct {
	Transition Transition
	Issue      *Issue
	Notify     bool
	End        time.Time
}

func (Outcome) Enum() []any {
	return []any{OutcomeAnomalous, OutcomeClean, OutcomeNoData}
}

func (evaluation Evaluation) Validate() error {
	if _, err := NewFingerprint(evaluation.Detector, evaluation.Service, evaluation.GroupID); err != nil {
		return err
	}
	switch {
	case evaluation.Outcome != OutcomeAnomalous && evaluation.Outcome != OutcomeClean && evaluation.Outcome != OutcomeNoData:
		return errors.Newf(errors.TypeInvalidInput, ErrCodeInvalidEvaluation, "unknown evaluation outcome %q", evaluation.Outcome.StringValue())
	case evaluation.End.IsZero() || evaluation.Now.IsZero():
		return errors.Newf(errors.TypeInvalidInput, ErrCodeInvalidEvaluation, "an evaluation needs its window end and the current time")
	case evaluation.Outcome != OutcomeAnomalous:
		return nil
	case evaluation.Evidence == nil:
		return errors.Newf(errors.TypeInvalidInput, ErrCodeInvalidEvaluation, "an anomalous evaluation needs evidence")
	case evaluation.Detector.IsRED() && evaluation.PeakScore == nil:
		return errors.Newf(errors.TypeInvalidInput, ErrCodeInvalidEvaluation, "an anomalous %s evaluation needs a peak score", evaluation.Detector.StringValue())
	}
	return evaluation.Evidence.Validate()
}

// ApplyEvaluation applies one evaluation to the issue sharing its
// fingerprint: the active one, else the most recently resolved one, else nil.
// It does not modify issue.
func ApplyEvaluation(issue *Issue, evaluation Evaluation) (*Change, error) {
	if err := evaluation.Validate(); err != nil {
		return nil, err
	}
	fingerprint, _ := NewFingerprint(evaluation.Detector, evaluation.Service, evaluation.GroupID)
	if issue != nil && (issue.OrgID != evaluation.OrgID || issue.Fingerprint != fingerprint) {
		return nil, errors.Newf(errors.TypeInvalidInput, ErrCodeInvalidEvaluation, "issue %s is not the evaluated one", issue.ID)
	}
	evaluation.End = evaluation.End.UTC()
	evaluation.Now = evaluation.Now.UTC()
	if !evaluation.Detector.IsRED() {
		evaluation.PeakScore = nil
	}

	switch {
	case issue != nil && issue.LastEvaluatedAt != nil && !evaluation.End.After(*issue.LastEvaluatedAt):
		return evaluation.unchanged(issue), nil
	case issue == nil || issue.Status == StatusResolved:
		return evaluation.applyToInactive(issue, fingerprint), nil
	case issue.Detector == DetectorNewException:
		return evaluation.unchanged(issue), nil
	case issue.isMutedAt(evaluation.Now):
		return evaluation.applyWhileMuted(issue), nil
	case issue.Status == StatusMuted:
		return evaluation.applyAfterMute(issue), nil
	default:
		return evaluation.applyToActive(issue), nil
	}
}

func (evaluation Evaluation) applyToInactive(resolved *Issue, fingerprint string) *Change {
	if evaluation.Outcome != OutcomeAnomalous {
		return evaluation.unchanged(resolved)
	}
	if resolved != nil && resolved.ResolvedAt != nil && evaluation.Now.Sub(*resolved.ResolvedAt) <= ReopenWindow {
		next := *resolved
		next.Status = StatusOpen
		next.ResolvedAt = nil
		next.MutedUntil = nil
		next.recordAnomaly(evaluation)
		return evaluation.changed(TransitionReopened, &next, true)
	}
	issue := &Issue{
		Identifiable:  types.Identifiable{ID: valuer.GenerateUUID()},
		TimeAuditable: types.TimeAuditable{CreatedAt: evaluation.Now},
		OrgID:         evaluation.OrgID,
		Detector:      evaluation.Detector,
		Service:       evaluation.Service,
		Fingerprint:   fingerprint,
		Status:        StatusOpen,
		Severity:      SeverityWarning,
		FirstSeen:     evaluation.End,
	}
	issue.recordAnomaly(evaluation)
	return evaluation.changed(TransitionCreated, issue, true)
}

func (evaluation Evaluation) applyToActive(issue *Issue) *Change {
	next := *issue
	switch evaluation.Outcome {
	case OutcomeAnomalous:
		next.recordAnomaly(evaluation)
		return evaluation.changed(TransitionUpdated, &next, false)
	case OutcomeClean:
		next.recordClean(evaluation)
		if next.CleanEvaluations >= CleanEvaluationsToResolve {
			next.resolve(evaluation.Now)
			return evaluation.changed(TransitionResolved, &next, true)
		}
		return evaluation.changed(TransitionUpdated, &next, false)
	default:
		return evaluation.unchanged(issue)
	}
}

func (evaluation Evaluation) applyWhileMuted(issue *Issue) *Change {
	if evaluation.Outcome != OutcomeAnomalous {
		return evaluation.unchanged(issue)
	}
	next := *issue
	next.recordAnomaly(evaluation)
	return evaluation.changed(TransitionUpdated, &next, false)
}

// applyAfterMute opens an issue whose mute expired, whatever the outcome, so
// no issue stays muted forever.
func (evaluation Evaluation) applyAfterMute(issue *Issue) *Change {
	next := *issue
	next.Status = StatusOpen
	next.MutedUntil = nil
	next.UpdatedAt = evaluation.Now
	switch evaluation.Outcome {
	case OutcomeAnomalous:
		next.recordAnomaly(evaluation)
		return evaluation.changed(TransitionUnmuted, &next, true)
	case OutcomeClean:
		next.recordClean(evaluation)
		if next.CleanEvaluations >= CleanEvaluationsToResolve {
			next.resolve(evaluation.Now)
			return evaluation.changed(TransitionResolved, &next, true)
		}
	}
	return evaluation.changed(TransitionUnmuted, &next, false)
}

func (evaluation Evaluation) changed(transition Transition, issue *Issue, notify bool) *Change {
	return &Change{Transition: transition, Issue: issue, Notify: notify, End: evaluation.End}
}

func (evaluation Evaluation) unchanged(issue *Issue) *Change {
	return &Change{Transition: TransitionNone, Issue: issue, End: evaluation.End}
}
