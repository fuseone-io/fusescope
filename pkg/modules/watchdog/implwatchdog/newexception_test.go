package implwatchdog

import (
	"cmp"
	"context"
	"fmt"
	"slices"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	sdkmetric "go.opentelemetry.io/otel/sdk/metric"
	"go.opentelemetry.io/otel/sdk/metric/metricdata"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/instrumentation/instrumentationtest"
	"github.com/fuseone-io/fusescope/pkg/modules/watchdog"
	"github.com/fuseone-io/fusescope/pkg/sqlstore"
	"github.com/fuseone-io/fusescope/pkg/types/watchdogtypes"
)

// fakeExceptions answers the new exception groups read from groups, as the
// error index would, and records the cursor of every call.
type fakeExceptions struct {
	groups  []watchdogtypes.ExceptionGroup
	fail    bool
	mu      sync.Mutex
	cursors []watchdogtypes.ExceptionCursor
}

func (f *fakeExceptions) ListNewGroups(_ context.Context, window watchdogtypes.Window, cursor watchdogtypes.ExceptionCursor) ([]watchdogtypes.ExceptionGroup, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.cursors = append(f.cursors, cursor)
	if f.fail {
		return nil, errors.Newf(errors.TypeInternal, errors.CodeInternal, "clickhouse is unavailable")
	}
	groups := make([]watchdogtypes.ExceptionGroup, 0)
	for _, group := range f.groups {
		after := group.FirstSeen.After(cursor.FirstSeen) || (cursor.GroupID != "" && group.FirstSeen.Equal(cursor.FirstSeen) && group.GroupID > cursor.GroupID)
		if after && !group.FirstSeen.After(window.End) {
			groups = append(groups, group)
		}
	}
	slices.SortFunc(groups, func(a, b watchdogtypes.ExceptionGroup) int {
		return cmp.Or(a.FirstSeen.Compare(b.FirstSeen), cmp.Compare(a.GroupID, b.GroupID))
	})
	return groups[:min(len(groups), watchdogtypes.ExceptionBatchSize+1)], nil
}

// failingModule fails the evaluations fail selects.
type failingModule struct {
	watchdog.Module
	fail func(watchdogtypes.Evaluation) bool
}

func (m *failingModule) Evaluate(ctx context.Context, evaluation watchdogtypes.Evaluation) (*watchdogtypes.Change, error) {
	if m.fail(evaluation) {
		return nil, errors.Newf(errors.TypeInternal, errors.CodeInternal, "the metastore is unavailable")
	}
	return m.Module.Evaluate(ctx, evaluation)
}

// cycle is the n-th window after evaluatedWindow.
func cycle(n int) watchdogtypes.Window {
	return watchdogtypes.NewWindow(storeStart.Add(time.Hour + time.Duration(n)*watchdogtypes.BucketStep))
}

// groupsAt returns count groups of service, all first seen at firstSeen.
func groupsAt(service string, firstSeen time.Time, count int) []watchdogtypes.ExceptionGroup {
	groups := make([]watchdogtypes.ExceptionGroup, count)
	for i := range groups {
		groups[i] = watchdogtypes.ExceptionGroup{GroupID: fmt.Sprintf("%s-%03d", service, i), Service: service, Type: "TimeoutError", FirstSeen: firstSeen}
	}
	return groups
}

// exceptionWorld has a history for payments only, and the RED detectors
// disabled so only new_exception opens issues.
func exceptionWorld(t *testing.T, sqlStore sqlstore.SQLStore) world {
	for _, detector := range []watchdogtypes.Detector{watchdogtypes.DetectorErrorRate, watchdogtypes.DetectorLatencyP99, watchdogtypes.DetectorThroughputDrop} {
		disable(t, sqlStore, detector)
	}
	w := world{}
	seasons(w, "payments", 100)
	return w
}

func disable(t *testing.T, sqlStore sqlstore.SQLStore, detector watchdogtypes.Detector) {
	setting := watchdogtypes.NewDefaultSetting(testOrgID, detector)
	setting.Enabled = false
	require.NoError(t, NewModule(NewStore(sqlStore)).PutSetting(context.Background(), setting))
}

func exceptionGroups(t *testing.T, sqlStore sqlstore.SQLStore) []string {
	issues, err := NewStore(sqlStore).ListActiveIssues(context.Background(), testOrgID)
	require.NoError(t, err)
	groups := make([]string, 0)
	for _, issue := range issues {
		if issue.Detector == watchdogtypes.DetectorNewException {
			groups = append(groups, issue.Evidence.GroupID)
		}
	}
	slices.Sort(groups)
	return groups
}

func groupIDs(groups []watchdogtypes.ExceptionGroup) []string {
	ids := make([]string, 0, len(groups))
	for _, group := range groups {
		ids = append(ids, group.GroupID)
	}
	slices.Sort(ids)
	return ids
}

func exceptionOverflows(t *testing.T, reader *sdkmetric.ManualReader) int64 {
	var rm metricdata.ResourceMetrics
	require.NoError(t, reader.Collect(context.Background(), &rm))
	for _, sm := range rm.ScopeMetrics {
		for _, m := range sm.Metrics {
			if m.Name == "fusescope.watchdog.exception_overflow" {
				var total int64
				for _, dp := range m.Data.(metricdata.Sum[int64]).DataPoints {
					total += dp.Value
				}
				return total
			}
		}
	}
	return 0
}

// warmed is a session past its warm-up at window.
func warmed(window watchdogtypes.Window) *exceptionCursors {
	cursors := newExceptionCursors()
	cursors.set(testOrgID, watchdogtypes.NewExceptionCursor(window.End))
	return cursors
}

func TestNewException_WarmUp_OpensNothingSeenBefore(t *testing.T) {
	forEachStore(t, func(t *testing.T, sqlStore sqlstore.SQLStore) {
		ctx := context.Background()
		org, fake := newTestOrgEvaluator(t, sqlStore, exceptionWorld(t, sqlStore), 10)
		seen := groupsAt("payments", cycle(0).End.Add(-time.Minute), 1)
		fresh := groupsAt("payments", cycle(1).End, 1)
		fresh[0].GroupID = "payments-fresh"
		fake.exceptions.groups = append(seen, fresh...)
		cursors := newExceptionCursors()

		require.NoError(t, org.evaluate(ctx, testOrgID, cycle(0), cursors))
		assert.Empty(t, fake.calls, "warm-up queries nothing")
		assert.Empty(t, fake.exceptions.cursors)
		assert.Empty(t, exceptionGroups(t, sqlStore))

		require.NoError(t, org.evaluate(ctx, testOrgID, cycle(1), cursors))
		assert.Equal(t, []string{"payments-fresh"}, exceptionGroups(t, sqlStore))
	})
}

func TestNewException_Overflow_ProcessedOverCycles(t *testing.T) {
	forEachStore(t, func(t *testing.T, sqlStore sqlstore.SQLStore) {
		ctx := context.Background()
		reader := sdkmetric.NewManualReader()
		settings := instrumentationtest.New().ToProviderSettings()
		settings.MeterProvider = sdkmetric.NewMeterProvider(sdkmetric.WithReader(reader))
		org, fake := newTestOrgEvaluatorWithSettings(t, settings, sqlStore, exceptionWorld(t, sqlStore), 10)
		fake.exceptions.groups = groupsAt("payments", cycle(0).End.Add(time.Minute), watchdogtypes.ExceptionBatchSize+1)
		cursors := warmed(cycle(0))

		require.NoError(t, org.evaluate(ctx, testOrgID, cycle(1), cursors))
		assert.Len(t, exceptionGroups(t, sqlStore), watchdogtypes.ExceptionBatchSize)
		assert.Equal(t, int64(1), exceptionOverflows(t, reader))

		require.NoError(t, org.evaluate(ctx, testOrgID, cycle(2), cursors))
		require.NoError(t, org.evaluate(ctx, testOrgID, cycle(3), cursors))
		assert.Equal(t, groupIDs(fake.exceptions.groups), exceptionGroups(t, sqlStore), "every group once")
		assert.Equal(t, int64(1), exceptionOverflows(t, reader))
		assert.Equal(t, []watchdogtypes.ExceptionCursor{
			watchdogtypes.NewExceptionCursor(cycle(0).End),
			{FirstSeen: cycle(0).End.Add(time.Minute), GroupID: "payments-099"},
			watchdogtypes.NewExceptionCursor(cycle(2).End),
		}, fake.exceptions.cursors)
	})
}

func TestNewException_PersistenceFailure_ResumesAtFailedGroup(t *testing.T) {
	forEachStore(t, func(t *testing.T, sqlStore sqlstore.SQLStore) {
		ctx := context.Background()
		org, fake := newTestOrgEvaluator(t, sqlStore, exceptionWorld(t, sqlStore), 10)
		for i := range 5 {
			fake.exceptions.groups = append(fake.exceptions.groups, watchdogtypes.ExceptionGroup{GroupID: fmt.Sprintf("g%d", i), Service: "payments", FirstSeen: cycle(0).End.Add(time.Duration(i+1) * time.Second)})
		}
		failing := &failingModule{Module: org.module, fail: func(e watchdogtypes.Evaluation) bool { return e.GroupID == "g2" }}
		org.module = failing
		cursors := warmed(cycle(0))

		assert.Error(t, org.evaluate(ctx, testOrgID, cycle(1), cursors))
		assert.Equal(t, []string{"g0", "g1"}, exceptionGroups(t, sqlStore))

		failing.fail = func(watchdogtypes.Evaluation) bool { return false }
		require.NoError(t, org.evaluate(ctx, testOrgID, cycle(2), cursors))
		assert.Equal(t, []string{"g0", "g1", "g2", "g3", "g4"}, exceptionGroups(t, sqlStore))
		require.Len(t, fake.exceptions.cursors, 2)
		assert.Equal(t, watchdogtypes.ExceptionCursor{FirstSeen: cycle(0).End.Add(2 * time.Second), GroupID: "g1"}, fake.exceptions.cursors[1])
	})
}

func TestNewException_IneligibleHeadOfOverflow_Discarded(t *testing.T) {
	forEachStore(t, func(t *testing.T, sqlStore sqlstore.SQLStore) {
		ctx := context.Background()
		org, fake := newTestOrgEvaluator(t, sqlStore, exceptionWorld(t, sqlStore), 10)
		firstSeen := cycle(0).End.Add(time.Minute)
		newcomer := watchdogtypes.ExceptionGroup{GroupID: "a-newcomer", Service: "newcomer", FirstSeen: firstSeen}
		eligible := groupsAt("payments", firstSeen, watchdogtypes.ExceptionBatchSize)
		fake.exceptions.groups = append([]watchdogtypes.ExceptionGroup{newcomer}, eligible...)
		cursors := warmed(cycle(0))

		require.NoError(t, org.evaluate(ctx, testOrgID, cycle(1), cursors))
		assert.Len(t, exceptionGroups(t, sqlStore), watchdogtypes.ExceptionBatchSize-1)

		require.NoError(t, org.evaluate(ctx, testOrgID, cycle(2), cursors))
		assert.Equal(t, groupIDs(eligible), exceptionGroups(t, sqlStore))
		assert.Equal(t, watchdogtypes.ExceptionCursor{FirstSeen: firstSeen, GroupID: "payments-098"}, fake.exceptions.cursors[1])
	})
}

func TestNewException_Failures_KeepCursor(t *testing.T) {
	testCases := []struct {
		name    string
		fail    func(fake *fakeQuerier)
		queried int
	}{
		{name: "ExceptionQuery", fail: func(fake *fakeQuerier) { fake.exceptions.fail = true }, queried: 2},
		{name: "Discovery_NoExceptionQuery", fail: func(fake *fakeQuerier) { fake.fail = func(call) bool { return true } }, queried: 1},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			forEachStore(t, func(t *testing.T, sqlStore sqlstore.SQLStore) {
				ctx := context.Background()
				org, fake := newTestOrgEvaluator(t, sqlStore, exceptionWorld(t, sqlStore), 10)
				fake.exceptions.groups = groupsAt("payments", cycle(0).End.Add(time.Minute), 1)
				cursors := warmed(cycle(0))
				testCase.fail(fake)

				assert.Error(t, org.evaluate(ctx, testOrgID, cycle(1), cursors))
				assert.Empty(t, exceptionGroups(t, sqlStore))

				fake.fail, fake.exceptions.fail = nil, false
				require.NoError(t, org.evaluate(ctx, testOrgID, cycle(2), cursors))
				assert.Equal(t, []string{"payments-000"}, exceptionGroups(t, sqlStore))
				require.Len(t, fake.exceptions.cursors, testCase.queried)
				assert.Equal(t, watchdogtypes.NewExceptionCursor(cycle(0).End), fake.exceptions.cursors[testCase.queried-1])
			})
		})
	}
}

func TestNewException_ServiceWithoutHistory_OpensNothing(t *testing.T) {
	forEachStore(t, func(t *testing.T, sqlStore sqlstore.SQLStore) {
		ctx := context.Background()
		org, fake := newTestOrgEvaluator(t, sqlStore, exceptionWorld(t, sqlStore), 10)
		fake.exceptions.groups = groupsAt("newcomer", cycle(0).End.Add(time.Minute), 3)
		cursors := warmed(cycle(0))

		require.NoError(t, org.evaluate(ctx, testOrgID, cycle(1), cursors))
		require.NoError(t, org.evaluate(ctx, testOrgID, cycle(2), cursors))

		assert.Empty(t, exceptionGroups(t, sqlStore))
		assert.Equal(t, watchdogtypes.NewExceptionCursor(cycle(1).End), fake.exceptions.cursors[1], "discarded groups are passed")
	})
}

func TestNewException_Disabled_WarmsAgainWhenEnabled(t *testing.T) {
	forEachStore(t, func(t *testing.T, sqlStore sqlstore.SQLStore) {
		ctx := context.Background()
		org, fake := newTestOrgEvaluator(t, sqlStore, exceptionWorld(t, sqlStore), 10)
		fake.exceptions.groups = groupsAt("payments", cycle(1).End.Add(-time.Minute), 1)
		cursors := warmed(cycle(0))
		disable(t, sqlStore, watchdogtypes.DetectorNewException)

		require.NoError(t, org.evaluate(ctx, testOrgID, cycle(1), cursors))
		assert.Empty(t, fake.calls)
		assert.Empty(t, fake.exceptions.cursors)

		require.NoError(t, NewModule(NewStore(sqlStore)).PutSetting(ctx, watchdogtypes.NewDefaultSetting(testOrgID, watchdogtypes.DetectorNewException)))
		require.NoError(t, org.evaluate(ctx, testOrgID, cycle(2), cursors))
		require.NoError(t, org.evaluate(ctx, testOrgID, cycle(3), cursors))
		assert.Empty(t, exceptionGroups(t, sqlStore), "a group first seen while disabled opens nothing")
		assert.Equal(t, []watchdogtypes.ExceptionCursor{watchdogtypes.NewExceptionCursor(cycle(2).End)}, fake.exceptions.cursors)
	})
}

func TestNewException_ExpiredMute_ReopensEachCycle(t *testing.T) {
	testCases := []struct {
		name    string
		enabled bool
	}{
		{name: "Enabled", enabled: true},
		{name: "Disabled", enabled: false},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			forEachStore(t, func(t *testing.T, sqlStore sqlstore.SQLStore) {
				ctx := context.Background()
				s := NewStore(sqlStore)
				group := groupsAt("payments", storeStart, 1)[0]
				created, err := NewModule(s).Evaluate(ctx, watchdogtypes.NewExceptionEvaluation(testOrgID, watchdogtypes.NewWindow(storeStart), group, storeStart))
				require.NoError(t, err)
				w := exceptionWorld(t, sqlStore)
				if !testCase.enabled {
					disable(t, sqlStore, watchdogtypes.DetectorNewException)
				}
				org, _ := newTestOrgEvaluator(t, sqlStore, w, 10)
				cursors := warmed(cycle(0))

				issue := created.Issue
				for n := 1; n <= 2; n++ {
					until := time.Now().Add(-time.Minute)
					next := *issue
					require.NoError(t, next.Mute(until, until.Add(-time.Hour)))
					saved, err := s.SaveChange(ctx, issue, &watchdogtypes.Change{Transition: watchdogtypes.TransitionUpdated, Issue: &next, End: issue.LastEvaluatedAt.Add(time.Minute)})
					require.NoError(t, err)
					require.True(t, saved)

					require.NoError(t, org.evaluate(ctx, testOrgID, cycle(n), cursors))

					issue, err = s.GetActiveIssue(ctx, testOrgID, issue.Fingerprint)
					require.NoError(t, err)
					assert.Equal(t, watchdogtypes.StatusOpen, issue.Status)
					assert.Nil(t, issue.MutedUntil)
				}
			})
		})
	}
}
