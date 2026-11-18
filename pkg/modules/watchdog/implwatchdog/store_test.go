package implwatchdog

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/sqlstore"
	"github.com/fuseone-io/fusescope/pkg/types/watchdogtypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
)

var storeStart = time.Date(2026, 11, 18, 12, 0, 0, 0, time.UTC)

func evaluation(orgID valuer.UUID, service string, outcome watchdogtypes.Outcome, end time.Duration) watchdogtypes.Evaluation {
	peak := -6.25
	value := 0.4
	return watchdogtypes.Evaluation{
		OrgID:    orgID,
		Detector: watchdogtypes.DetectorThroughputDrop,
		Service:  service,
		Outcome:  outcome,
		End:      storeStart.Add(end),
		Now:      storeStart.Add(end + 2*time.Minute),
		Evidence: &watchdogtypes.Evidence{
			Version:  watchdogtypes.EvidenceVersion,
			Buckets:  []watchdogtypes.EvidenceBucket{{Timestamp: storeStart.Add(end - 5*time.Minute), Value: &value}},
			Score:    peak,
			Query:    json.RawMessage(`{"signal":"traces"}`),
			Warnings: []string{},
		},
		PeakScore: &peak,
	}
}

func apply(t *testing.T, issue *watchdogtypes.Issue, e watchdogtypes.Evaluation) *watchdogtypes.Change {
	t.Helper()
	change, err := watchdogtypes.ApplyEvaluation(issue, e)
	require.NoError(t, err)
	return change
}

func create(t *testing.T, s watchdogtypes.Store, orgID valuer.UUID, service string, end time.Duration) *watchdogtypes.Issue {
	t.Helper()
	change := apply(t, nil, evaluation(orgID, service, watchdogtypes.OutcomeAnomalous, end))
	saved, err := s.SaveChange(context.Background(), nil, change)
	require.NoError(t, err)
	require.True(t, saved)
	return change.Issue
}

func resolve(t *testing.T, s watchdogtypes.Store, issue *watchdogtypes.Issue, now time.Time) *watchdogtypes.Issue {
	t.Helper()
	next := *issue
	next.Status = watchdogtypes.StatusResolved
	next.ResolvedAt = &now
	end := issue.LastEvaluatedAt.Add(time.Minute)
	saved, err := s.SaveChange(context.Background(), issue, &watchdogtypes.Change{Transition: watchdogtypes.TransitionResolved, Issue: &next, End: end})
	require.NoError(t, err)
	require.True(t, saved)
	return &next
}

func TestStoreIssueRoundTrip(t *testing.T) {
	forEachStore(t, func(t *testing.T, sqlStore sqlstore.SQLStore) {
		ctx := context.Background()
		s := NewStore(sqlStore)
		issue := create(t, s, testOrgID, "checkout", 0)

		got, err := s.GetActiveIssue(ctx, testOrgID, issue.Fingerprint)
		require.NoError(t, err)
		assert.Equal(t, issue.ID, got.ID)
		assert.Equal(t, watchdogtypes.DetectorThroughputDrop, got.Detector)
		assert.Equal(t, watchdogtypes.StatusOpen, got.Status)
		assert.Equal(t, watchdogtypes.SeverityWarning, got.Severity)
		assert.Equal(t, issue.PeakScore, got.PeakScore)
		assert.Equal(t, issue.Evidence, got.Evidence)
		assert.True(t, issue.FirstSeen.Equal(got.FirstSeen))
		require.NotNil(t, got.LastEvaluatedAt)
		assert.True(t, issue.LastEvaluatedAt.Equal(*got.LastEvaluatedAt))
		assert.Nil(t, got.ResolvedAt)
		assert.Nil(t, got.MutedUntil)

		_, err = s.GetActiveIssue(ctx, otherOrgID, issue.Fingerprint)
		assert.True(t, errors.Ast(err, errors.TypeNotFound), "issues are per organization, got %v", err)
	})
}

func TestStoreOneActiveIssuePerFingerprint(t *testing.T) {
	forEachStore(t, func(t *testing.T, sqlStore sqlstore.SQLStore) {
		ctx := context.Background()
		s := NewStore(sqlStore)
		first := create(t, s, testOrgID, "checkout", 0)

		duplicate := apply(t, nil, evaluation(testOrgID, "checkout", watchdogtypes.OutcomeAnomalous, 5*time.Minute))
		saved, err := s.SaveChange(ctx, nil, duplicate)
		require.NoError(t, err)
		assert.False(t, saved, "a second active issue is not created")
		_, err = sqlStore.BunDB().NewInsert().Model(duplicate.Issue).Exec(ctx)
		assert.Error(t, err, "the partial unique index rejects it")

		resolve(t, s, first, storeStart.Add(10*time.Minute))
		_, err = s.GetActiveIssue(ctx, testOrgID, first.Fingerprint)
		assert.True(t, errors.Ast(err, errors.TypeNotFound), "got %v", err)

		second := create(t, s, testOrgID, "checkout", 2*time.Hour)
		assert.NotEqual(t, first.ID, second.ID, "a resolved issue frees its fingerprint")
		active, err := s.GetActiveIssue(ctx, testOrgID, first.Fingerprint)
		require.NoError(t, err)
		assert.Equal(t, second.ID, active.ID)
	})
}

func TestStoreSaveChangeIsIdempotentByEnd(t *testing.T) {
	forEachStore(t, func(t *testing.T, sqlStore sqlstore.SQLStore) {
		ctx := context.Background()
		s := NewStore(sqlStore)
		issue := create(t, s, testOrgID, "checkout", 0)

		change := apply(t, issue, evaluation(testOrgID, "checkout", watchdogtypes.OutcomeClean, 5*time.Minute))
		saved, err := s.SaveChange(ctx, issue, change)
		require.NoError(t, err)
		assert.True(t, saved)
		saved, err = s.SaveChange(ctx, issue, change)
		require.NoError(t, err)
		assert.False(t, saved, "the same end is applied once")

		got, err := s.GetActiveIssue(ctx, testOrgID, issue.Fingerprint)
		require.NoError(t, err)
		assert.Equal(t, 1, got.CleanEvaluations)

		muted := *issue
		muted.Status = watchdogtypes.StatusMuted
		later := *change
		later.End = storeStart.Add(10 * time.Minute)
		saved, err = s.SaveChange(ctx, &muted, &later)
		require.NoError(t, err)
		assert.False(t, saved, "a change made from another status is refused")

		none := apply(t, got, evaluation(testOrgID, "checkout", watchdogtypes.OutcomeNoData, 10*time.Minute))
		saved, err = s.SaveChange(ctx, got, none)
		require.NoError(t, err)
		assert.False(t, saved)
	})
}

func TestStoreRunInTxRollsBack(t *testing.T) {
	forEachStore(t, func(t *testing.T, sqlStore sqlstore.SQLStore) {
		ctx := context.Background()
		s := NewStore(sqlStore)
		issue := create(t, s, testOrgID, "checkout", 0)
		change := apply(t, issue, evaluation(testOrgID, "checkout", watchdogtypes.OutcomeClean, 5*time.Minute))
		created := apply(t, nil, evaluation(testOrgID, "cart", watchdogtypes.OutcomeAnomalous, 5*time.Minute))

		failure := errors.New(errors.TypeInternal, errors.CodeInternal, "notification failed")
		err := s.RunInTx(ctx, func(ctx context.Context) error {
			saved, err := s.SaveChange(ctx, issue, change)
			require.NoError(t, err)
			require.True(t, saved)
			saved, err = s.SaveChange(ctx, nil, created)
			require.NoError(t, err)
			require.True(t, saved)
			return failure
		})
		require.ErrorIs(t, err, failure)

		got, err := s.GetActiveIssue(ctx, testOrgID, issue.Fingerprint)
		require.NoError(t, err)
		assert.Zero(t, got.CleanEvaluations, "the counter and last_evaluated_at roll back together")
		assert.True(t, issue.LastEvaluatedAt.Equal(*got.LastEvaluatedAt))
		_, err = s.GetActiveIssue(ctx, testOrgID, created.Issue.Fingerprint)
		assert.True(t, errors.Ast(err, errors.TypeNotFound), "got %v", err)
	})
}

func TestStoreListActiveAndLastResolved(t *testing.T) {
	forEachStore(t, func(t *testing.T, sqlStore sqlstore.SQLStore) {
		ctx := context.Background()
		s := NewStore(sqlStore)
		old := create(t, s, testOrgID, "checkout", 0)
		resolve(t, s, old, storeStart.Add(10*time.Minute))
		recent := create(t, s, testOrgID, "checkout", time.Hour)
		resolve(t, s, recent, storeStart.Add(2*time.Hour))
		active := create(t, s, testOrgID, "checkout", 3*time.Hour)
		cart := create(t, s, testOrgID, "cart", 0)
		create(t, s, otherOrgID, "checkout", 0)

		last, err := s.GetLastResolvedIssue(ctx, testOrgID, old.Fingerprint)
		require.NoError(t, err)
		assert.Equal(t, recent.ID, last.ID)
		_, err = s.GetLastResolvedIssue(ctx, testOrgID, cart.Fingerprint)
		assert.True(t, errors.Ast(err, errors.TypeNotFound), "got %v", err)

		issues, err := s.ListActiveIssues(ctx, testOrgID)
		require.NoError(t, err)
		ids := []valuer.UUID{}
		for _, issue := range issues {
			ids = append(ids, issue.ID)
		}
		assert.ElementsMatch(t, []valuer.UUID{active.ID, cart.ID}, ids)
	})
}

func TestStoreDeleteResolvedIssues(t *testing.T) {
	forEachStore(t, func(t *testing.T, sqlStore sqlstore.SQLStore) {
		ctx := context.Background()
		s := NewStore(sqlStore)
		cutoff := storeStart.Add(-watchdogtypes.ResolvedIssueRetention)
		for i, service := range []string{"a", "b", "c"} {
			resolve(t, s, create(t, s, testOrgID, service, 0), cutoff.Add(-time.Duration(i+1)*time.Hour))
		}
		kept := resolve(t, s, create(t, s, otherOrgID, "d", 0), cutoff.Add(time.Hour))
		active := create(t, s, testOrgID, "e", 0)

		for _, expected := range []int64{2, 1, 0} {
			deleted, err := s.DeleteResolvedIssues(ctx, cutoff, 2)
			require.NoError(t, err)
			assert.Equal(t, expected, deleted)
		}

		var left []string
		require.NoError(t, sqlStore.BunDB().NewSelect().Table("watchdog_issue").Column("id").Scan(ctx, &left))
		assert.ElementsMatch(t, []string{kept.ID.StringValue(), active.ID.StringValue()}, left)
	})
}

func TestStoreSettings(t *testing.T) {
	forEachStore(t, func(t *testing.T, sqlStore sqlstore.SQLStore) {
		ctx := context.Background()
		s := NewStore(sqlStore)

		settings, err := s.ListSettings(ctx, testOrgID)
		require.NoError(t, err)
		require.Len(t, settings, 4)
		for _, setting := range settings {
			assert.True(t, setting.Enabled, setting.Detector.StringValue())
			assert.False(t, setting.Notify, setting.Detector.StringValue())
		}

		setting := watchdogtypes.NewDefaultSetting(testOrgID, watchdogtypes.DetectorLatencyP99)
		setting.Notify = true
		require.NoError(t, s.PutSetting(ctx, setting))
		setting = watchdogtypes.NewDefaultSetting(testOrgID, watchdogtypes.DetectorLatencyP99)
		setting.Enabled = false
		setting.Notify = true
		require.NoError(t, s.PutSetting(ctx, setting), "putting a setting again replaces it")

		got, err := s.GetSetting(ctx, testOrgID, watchdogtypes.DetectorLatencyP99)
		require.NoError(t, err)
		assert.False(t, got.Enabled)
		assert.True(t, got.Notify)
		got, err = s.GetSetting(ctx, otherOrgID, watchdogtypes.DetectorLatencyP99)
		require.NoError(t, err)
		assert.True(t, got.Enabled, "settings are per organization")
		assert.False(t, got.Notify)

		settings, err = s.ListSettings(ctx, testOrgID)
		require.NoError(t, err)
		require.Len(t, settings, 4)
		for _, setting := range settings {
			stored := setting.Detector == watchdogtypes.DetectorLatencyP99
			assert.Equal(t, !stored, setting.Enabled, setting.Detector.StringValue())
			assert.Equal(t, stored, setting.Notify, setting.Detector.StringValue())
		}

		unknown := watchdogtypes.NewDefaultSetting(testOrgID, watchdogtypes.Detector{String: valuer.NewString("apdex")})
		assert.True(t, errors.Ast(s.PutSetting(ctx, unknown), errors.TypeInvalidInput))
		_, err = s.GetSetting(ctx, testOrgID, unknown.Detector)
		assert.True(t, errors.Ast(err, errors.TypeInvalidInput))
	})
}
