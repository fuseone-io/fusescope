package watchdogtypes

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/valuer"
)

var lifecycleStart = time.Date(2026, 11, 18, 12, 0, 0, 0, time.UTC)

// step is one evaluation ending at lifecycleStart+end and applied two
// minutes later, or, with muteUntil set, a user muting the issue until
// lifecycleStart+muteUntil, or, with acknowledge, a user acknowledging it.
type step struct {
	outcome     Outcome
	end         time.Duration
	peak        float64
	muteUntil   time.Duration
	acknowledge bool
}

func anomalous(end time.Duration) step { return step{outcome: OutcomeAnomalous, end: end, peak: 5} }
func clean(end time.Duration) step     { return step{outcome: OutcomeClean, end: end} }
func noData(end time.Duration) step    { return step{outcome: OutcomeNoData, end: end} }
func mute(until time.Duration) step    { return step{muteUntil: until} }
func acknowledge() step                { return step{acknowledge: true} }

func evaluationAt(detector Detector, s step) Evaluation {
	evaluation := Evaluation{
		OrgID:    valuer.MustNewUUID("0196e2e4-0000-7000-8000-000000000001"),
		Detector: detector,
		Service:  "checkout",
		Outcome:  s.outcome,
		End:      lifecycleStart.Add(s.end),
		Now:      lifecycleStart.Add(s.end + 2*time.Minute),
	}
	if detector == DetectorNewException {
		evaluation.GroupID = "9f86d081884c7d65"
	}
	if s.outcome == OutcomeAnomalous {
		evaluation.Evidence = &Evidence{Version: EvidenceVersion, Score: s.peak}
		if detector.IsRED() {
			peak := s.peak
			evaluation.PeakScore = &peak
		}
	}
	return evaluation
}

func TestApplyEvaluation(t *testing.T) {
	m := time.Minute
	testCases := []struct {
		name        string
		detector    Detector
		steps       []step
		transitions []Transition
		status      Status
		cleans      int
		notify      bool
		sameIssue   bool
		peak        *float64
	}{
		{
			name:        "Anomalous_NoIssue_CreatesOpenIssue",
			steps:       []step{anomalous(0)},
			transitions: []Transition{TransitionCreated},
			status:      StatusOpen,
			notify:      true,
		},
		{
			name:        "ThreeCleans_DistinctEnds_Resolve",
			steps:       []step{anomalous(0), clean(5 * m), clean(10 * m), clean(15 * m)},
			transitions: []Transition{TransitionCreated, TransitionUpdated, TransitionUpdated, TransitionResolved},
			status:      StatusResolved,
			cleans:      3,
			notify:      true,
		},
		{
			name:        "Clean_SameEnd_CountsOnce",
			steps:       []step{anomalous(0), clean(5 * m), clean(5 * m), clean(5 * m), clean(10 * m)},
			transitions: []Transition{TransitionCreated, TransitionUpdated, TransitionNone, TransitionNone, TransitionUpdated},
			status:      StatusOpen,
			cleans:      2,
		},
		{
			name:        "Clean_OlderEnd_Ignored",
			steps:       []step{anomalous(0), clean(10 * m), clean(5 * m)},
			transitions: []Transition{TransitionCreated, TransitionUpdated, TransitionNone},
			status:      StatusOpen,
			cleans:      1,
		},
		{
			name:        "NoData_NeitherIncrementsNorResets",
			steps:       []step{anomalous(0), clean(5 * m), noData(10 * m), clean(15 * m), noData(20 * m), clean(25 * m)},
			transitions: []Transition{TransitionCreated, TransitionUpdated, TransitionNone, TransitionUpdated, TransitionNone, TransitionResolved},
			status:      StatusResolved,
			cleans:      3,
			notify:      true,
		},
		{
			name:        "NoData_NoIssue_None",
			steps:       []step{noData(0), clean(5 * m)},
			transitions: []Transition{TransitionNone, TransitionNone},
		},
		{
			name:        "Anomalous_MidWay_ResetsCleans",
			steps:       []step{anomalous(0), clean(5 * m), clean(10 * m), anomalous(15 * m), clean(20 * m), clean(25 * m)},
			transitions: []Transition{TransitionCreated, TransitionUpdated, TransitionUpdated, TransitionUpdated, TransitionUpdated, TransitionUpdated},
			status:      StatusOpen,
			cleans:      2,
			sameIssue:   true,
		},
		{
			name:        "Anomalous_Acknowledged_KeepsAcknowledgement",
			steps:       []step{anomalous(0), acknowledge(), anomalous(5 * m), clean(10 * m)},
			transitions: []Transition{TransitionCreated, TransitionUpdated, TransitionUpdated},
			status:      StatusAcknowledged,
			cleans:      1,
		},
		{
			name:        "ThreeCleans_Acknowledged_Resolve",
			steps:       []step{anomalous(0), acknowledge(), clean(5 * m), clean(10 * m), clean(15 * m)},
			transitions: []Transition{TransitionCreated, TransitionUpdated, TransitionUpdated, TransitionResolved},
			status:      StatusResolved,
			cleans:      3,
			notify:      true,
		},
		{
			name:        "Recurrence_WithinAnHourOfResolution_Reopens",
			steps:       []step{anomalous(0), clean(5 * m), clean(10 * m), clean(15 * m), anomalous(70 * m)},
			transitions: []Transition{TransitionCreated, TransitionUpdated, TransitionUpdated, TransitionResolved, TransitionReopened},
			status:      StatusOpen,
			notify:      true,
			sameIssue:   true,
		},
		{
			name:        "Recurrence_AfterAnHourOfResolution_CreatesIssue",
			steps:       []step{anomalous(0), clean(5 * m), clean(10 * m), clean(15 * m), anomalous(80 * m)},
			transitions: []Transition{TransitionCreated, TransitionUpdated, TransitionUpdated, TransitionResolved, TransitionCreated},
			status:      StatusOpen,
			notify:      true,
		},
		{
			name:        "CleanOrNoData_Resolved_None",
			steps:       []step{anomalous(0), clean(5 * m), clean(10 * m), clean(15 * m), clean(20 * m), noData(25 * m)},
			transitions: []Transition{TransitionCreated, TransitionUpdated, TransitionUpdated, TransitionResolved, TransitionNone, TransitionNone},
			status:      StatusResolved,
			cleans:      3,
		},
		{
			name:        "Peak_KeepsMostExtremeAbsoluteScore",
			steps:       []step{anomalous(0), {outcome: OutcomeAnomalous, end: 5 * m, peak: -9}, {outcome: OutcomeAnomalous, end: 10 * m, peak: 7}},
			transitions: []Transition{TransitionCreated, TransitionUpdated, TransitionUpdated},
			status:      StatusOpen,
			peak:        new(-9.0),
		},
		{
			name:        "Muted_NoDataAndClean_ChangeNothing",
			steps:       []step{anomalous(0), clean(5 * m), mute(60 * m), clean(10 * m), noData(15 * m)},
			transitions: []Transition{TransitionCreated, TransitionUpdated, TransitionNone, TransitionNone},
			status:      StatusMuted,
			cleans:      1,
		},
		{
			name:        "Muted_Anomalous_UpdatesEvidenceAndResetsCleans",
			steps:       []step{anomalous(0), clean(5 * m), mute(60 * m), {outcome: OutcomeAnomalous, end: 10 * m, peak: 8}},
			transitions: []Transition{TransitionCreated, TransitionUpdated, TransitionUpdated},
			status:      StatusMuted,
			peak:        new(8.0),
		},
		{
			name: "MuteExpiry_AnomalousDuringMute_FirstCleanDoesNotResolve",
			steps: []step{
				anomalous(0), clean(5 * m), clean(10 * m), mute(60 * m),
				anomalous(15 * m), clean(20 * m), clean(25 * m), clean(65 * m),
			},
			transitions: []Transition{
				TransitionCreated, TransitionUpdated, TransitionUpdated,
				TransitionUpdated, TransitionNone, TransitionNone, TransitionUnmuted,
			},
			status: StatusOpen,
			cleans: 1,
		},
		{
			name:        "MuteExpiry_CleanAfterTwo_Resolves",
			steps:       []step{anomalous(0), clean(5 * m), clean(10 * m), mute(60 * m), clean(15 * m), clean(65 * m)},
			transitions: []Transition{TransitionCreated, TransitionUpdated, TransitionUpdated, TransitionNone, TransitionResolved},
			status:      StatusResolved,
			cleans:      3,
			notify:      true,
		},
		{
			name:        "MuteExpiry_Anomalous_OpensAndNotifies",
			steps:       []step{anomalous(0), mute(30 * m), anomalous(35 * m)},
			transitions: []Transition{TransitionCreated, TransitionUnmuted},
			status:      StatusOpen,
			notify:      true,
		},
		{
			name:        "MuteExpiry_Clean_IncrementsAndOpens",
			steps:       []step{anomalous(0), mute(30 * m), clean(35 * m)},
			transitions: []Transition{TransitionCreated, TransitionUnmuted},
			status:      StatusOpen,
			cleans:      1,
		},
		{
			name:        "MuteExpiry_NoData_OpensSilently",
			steps:       []step{anomalous(0), mute(30 * m), noData(35 * m)},
			transitions: []Transition{TransitionCreated, TransitionUnmuted},
			status:      StatusOpen,
		},
		{
			name:        "NewException_NeverAutoResolves",
			detector:    DetectorNewException,
			steps:       []step{anomalous(0), clean(5 * m), clean(10 * m), clean(15 * m), clean(20 * m), anomalous(25 * m)},
			transitions: []Transition{TransitionCreated, TransitionNone, TransitionNone, TransitionNone, TransitionNone, TransitionNone},
			status:      StatusOpen,
		},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			detector := testCase.detector
			if detector.IsZero() {
				detector = DetectorErrorRate
			}
			var issue, first *Issue
			var last *Change
			transitions := []Transition{}
			for _, s := range testCase.steps {
				switch {
				case s.acknowledge:
					require.NotNil(t, issue)
					issue.Status = StatusAcknowledged
					continue
				case s.muteUntil != 0:
					require.NotNil(t, issue)
					require.NoError(t, issue.Mute(lifecycleStart.Add(s.muteUntil), last.Issue.UpdatedAt))
					continue
				}
				change, err := ApplyEvaluation(issue, evaluationAt(detector, s))
				require.NoError(t, err)
				transitions = append(transitions, change.Transition)
				issue, last = change.Issue, change
				if first == nil {
					first = issue
				}
			}

			assert.Equal(t, testCase.transitions, transitions)
			if testCase.status.IsZero() {
				assert.Nil(t, issue)
				return
			}
			require.NotNil(t, issue)
			assert.Equal(t, testCase.status, issue.Status)
			assert.Equal(t, testCase.cleans, issue.CleanEvaluations)
			assert.Equal(t, testCase.notify, last.Notify)
			if testCase.sameIssue {
				assert.Equal(t, first.ID, issue.ID)
			}
			if testCase.peak != nil {
				assert.Equal(t, testCase.peak, issue.PeakScore)
			}
			if issue.Status == StatusResolved {
				assert.NotNil(t, issue.ResolvedAt)
			} else {
				assert.Nil(t, issue.ResolvedAt)
			}
			if issue.Status != StatusMuted {
				assert.Nil(t, issue.MutedUntil)
			}
		})
	}
}

func TestApplyEvaluation_CreatedIssue(t *testing.T) {
	evaluation := evaluationAt(DetectorLatencyP99, anomalous(0))
	change, err := ApplyEvaluation(nil, evaluation)
	require.NoError(t, err)
	require.NotNil(t, change.Issue)

	fingerprint, err := NewFingerprint(DetectorLatencyP99, "checkout", "")
	require.NoError(t, err)
	issue := change.Issue
	assert.False(t, issue.ID.IsZero())
	assert.Equal(t, evaluation.OrgID, issue.OrgID)
	assert.Equal(t, DetectorLatencyP99, issue.Detector)
	assert.Equal(t, "checkout", issue.Service)
	assert.Equal(t, fingerprint, issue.Fingerprint)
	assert.Equal(t, SeverityWarning, issue.Severity)
	assert.Equal(t, evaluation.End, issue.FirstSeen)
	assert.Equal(t, evaluation.End, issue.LastSeen)
	assert.Equal(t, &evaluation.End, issue.LastEvaluatedAt)
	assert.Equal(t, evaluation.Evidence, issue.Evidence)
	assert.Equal(t, evaluation.End, change.End)
}

func TestApplyEvaluation_NewExceptionHasNoPeakScore(t *testing.T) {
	change, err := ApplyEvaluation(nil, evaluationAt(DetectorNewException, anomalous(0)))
	require.NoError(t, err)
	require.NotNil(t, change.Issue)
	assert.Nil(t, change.Issue.PeakScore)
}

func TestApplyEvaluation_Invalid(t *testing.T) {
	other, err := ApplyEvaluation(nil, evaluationAt(DetectorThroughputDrop, anomalous(0)))
	require.NoError(t, err)

	testCases := []struct {
		name   string
		issue  *Issue
		mutate func(*Evaluation)
	}{
		{name: "UnknownDetector", mutate: func(e *Evaluation) { e.Detector = Detector{valuer.NewString("apdex")} }},
		{name: "UnknownOutcome", mutate: func(e *Evaluation) { e.Outcome = Outcome{valuer.NewString("maybe")} }},
		{name: "MissingEnd", mutate: func(e *Evaluation) { e.End = time.Time{} }},
		{name: "MissingNow", mutate: func(e *Evaluation) { e.Now = time.Time{} }},
		{name: "MissingService", mutate: func(e *Evaluation) { e.Service = "" }},
		{name: "Anomalous_MissingEvidence", mutate: func(e *Evaluation) { e.Evidence = nil }},
		{name: "Anomalous_RED_MissingPeakScore", mutate: func(e *Evaluation) { e.PeakScore = nil }},
		{name: "Evidence_UnknownVersion", mutate: func(e *Evaluation) { e.Evidence.Version = 2 }},
		{name: "Issue_OtherFingerprint", issue: other.Issue, mutate: func(*Evaluation) {}},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			evaluation := evaluationAt(DetectorErrorRate, anomalous(0))
			testCase.mutate(&evaluation)
			_, err := ApplyEvaluation(testCase.issue, evaluation)
			assert.True(t, errors.Ast(err, errors.TypeInvalidInput), "got %v", err)
		})
	}
}

func TestIssueMute(t *testing.T) {
	now := lifecycleStart
	testCases := []struct {
		name   string
		status Status
		until  time.Time
		valid  bool
	}{
		{name: "Open_FutureUntil_Mutes", status: StatusOpen, until: now.Add(time.Hour), valid: true},
		{name: "Acknowledged_FutureUntil_Mutes", status: StatusAcknowledged, until: now.Add(time.Minute), valid: true},
		{name: "Muted_FutureUntil_ExtendsMute", status: StatusMuted, until: now.Add(time.Hour), valid: true},
		{name: "Open_UntilNow_Rejected", status: StatusOpen, until: now},
		{name: "Open_PastUntil_Rejected", status: StatusOpen, until: now.Add(-time.Minute)},
		{name: "Resolved_FutureUntil_Rejected", status: StatusResolved, until: now.Add(time.Hour)},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			issue := &Issue{Status: testCase.status}
			err := issue.Mute(testCase.until, now)
			if !testCase.valid {
				assert.True(t, errors.Ast(err, errors.TypeInvalidInput), "got %v", err)
				assert.Equal(t, testCase.status, issue.Status)
				return
			}
			require.NoError(t, err)
			assert.Equal(t, StatusMuted, issue.Status)
			assert.Equal(t, &testCase.until, issue.MutedUntil)
			assert.Equal(t, now, issue.UpdatedAt)
		})
	}
}
