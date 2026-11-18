package implwatchdog

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/fuseone-io/fusescope/pkg/sqlstore"
	"github.com/fuseone-io/fusescope/pkg/types/watchdogtypes"
)

func TestModuleEvaluate(t *testing.T) {
	m := time.Minute
	anomalous, clean, noData := watchdogtypes.OutcomeAnomalous, watchdogtypes.OutcomeClean, watchdogtypes.OutcomeNoData
	testCases := []struct {
		name        string
		outcomes    []watchdogtypes.Outcome
		ends        []time.Duration
		transitions []watchdogtypes.Transition
		status      watchdogtypes.Status
		cleans      int
		lastApplied time.Duration
	}{
		{
			name:     "ThreeCleans_RepeatedEnd_ResolveOnce",
			outcomes: []watchdogtypes.Outcome{anomalous, clean, clean, noData, clean, clean, clean},
			ends:     []time.Duration{0, 5 * m, 5 * m, 10 * m, 15 * m, 20 * m, 25 * m},
			transitions: []watchdogtypes.Transition{
				watchdogtypes.TransitionCreated, watchdogtypes.TransitionUpdated, watchdogtypes.TransitionNone, watchdogtypes.TransitionNone,
				watchdogtypes.TransitionUpdated, watchdogtypes.TransitionResolved, watchdogtypes.TransitionNone,
			},
			status:      watchdogtypes.StatusResolved,
			cleans:      3,
			lastApplied: 20 * m,
		},
		{
			name:     "Recurrence_WithinAnHour_ReopensStoredIssue",
			outcomes: []watchdogtypes.Outcome{anomalous, clean, clean, clean, anomalous, anomalous},
			ends:     []time.Duration{0, 5 * m, 10 * m, 15 * m, 30 * m, 30 * m},
			transitions: []watchdogtypes.Transition{
				watchdogtypes.TransitionCreated, watchdogtypes.TransitionUpdated, watchdogtypes.TransitionUpdated,
				watchdogtypes.TransitionResolved, watchdogtypes.TransitionReopened, watchdogtypes.TransitionNone,
			},
			status:      watchdogtypes.StatusOpen,
			lastApplied: 30 * m,
		},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			forEachStore(t, func(t *testing.T, sqlStore sqlstore.SQLStore) {
				ctx := context.Background()
				s := NewStore(sqlStore)
				module := NewModule(s)
				transitions := []watchdogtypes.Transition{}
				var fingerprint string
				for i, outcome := range testCase.outcomes {
					change, err := module.Evaluate(ctx, evaluation(testOrgID, "checkout", outcome, testCase.ends[i]))
					require.NoError(t, err)
					transitions = append(transitions, change.Transition)
					if change.Issue != nil {
						fingerprint = change.Issue.Fingerprint
					}
				}
				assert.Equal(t, testCase.transitions, transitions)

				var issues []*watchdogtypes.Issue
				require.NoError(t, sqlStore.BunDB().NewSelect().Model(&issues).Where("fingerprint = ?", fingerprint).Scan(ctx))
				require.Len(t, issues, 1, "the issue is reopened, not duplicated")
				assert.Equal(t, testCase.status, issues[0].Status)
				assert.Equal(t, testCase.cleans, issues[0].CleanEvaluations)
				require.NotNil(t, issues[0].LastEvaluatedAt)
				assert.True(t, storeStart.Add(testCase.lastApplied).Equal(*issues[0].LastEvaluatedAt), "last_evaluated_at is the last applied end")
			})
		})
	}
}

func TestModuleDeleteExpiredIssues(t *testing.T) {
	forEachStore(t, func(t *testing.T, sqlStore sqlstore.SQLStore) {
		ctx := context.Background()
		s := NewStore(sqlStore)
		module := NewModule(s)
		now := storeStart.Add(watchdogtypes.ResolvedIssueRetention + time.Hour)
		expired := resolve(t, s, create(t, s, testOrgID, "checkout", 0), storeStart)
		kept := resolve(t, s, create(t, s, testOrgID, "cart", 0), now.Add(-time.Hour))
		active := create(t, s, testOrgID, "frontend", 0)

		deleted, err := module.DeleteExpiredIssues(ctx, now)
		require.NoError(t, err)
		assert.Equal(t, int64(1), deleted)

		_, err = s.GetLastResolvedIssue(ctx, testOrgID, expired.Fingerprint)
		assert.Error(t, err)
		_, err = s.GetLastResolvedIssue(ctx, testOrgID, kept.Fingerprint)
		assert.NoError(t, err)
		_, err = s.GetActiveIssue(ctx, testOrgID, active.Fingerprint)
		assert.NoError(t, err)
	})
}
