package clickhouseReader

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/types/archivetypes"
	"github.com/fuseone-io/fusescope/pkg/types/retentiontypes"
)

const (
	testLogsTable     = "signoz_logs.logs_v2"
	testResourceTable = "signoz_logs.logs_v2_resource"
)

var testBackstopHosts = []string{"ch-1", "ch-2"}

func TestBackstopApplierApply(t *testing.T) {
	ctx := context.Background()

	t.Run("FirstApply_ResourceFirstThenLogs", func(t *testing.T) {
		cluster, progress := newFakeBackstopCluster(), newFakeBackstopProgress()

		require.NoError(t, newTestBackstopApplier(cluster, progress).apply(ctx))

		assert.Equal(t, []string{"MODIFY " + testResourceTable, "MATERIALIZE " + testResourceTable, "MODIFY " + testLogsTable, "MATERIALIZE " + testLogsTable}, cluster.issued())
		assert.True(t, progress.tables[testResourceTable].Done(7))
		assert.True(t, progress.tables[testLogsTable].Done(7))
	})

	t.Run("LogsFails_RetryDoesNotRewriteResource", func(t *testing.T) {
		cluster, progress := newFakeBackstopCluster(), newFakeBackstopProgress()
		cluster.failExec = "MATERIALIZE " + testLogsTable

		assert.Error(t, newTestBackstopApplier(cluster, progress).apply(ctx))
		cluster.failExec = ""
		require.NoError(t, newTestBackstopApplier(cluster, progress).apply(ctx))

		assert.Equal(t, []string{"MODIFY " + testResourceTable, "MATERIALIZE " + testResourceTable, "MODIFY " + testLogsTable, "MATERIALIZE " + testLogsTable}, cluster.issued(), "each table is modified and materialized once")
	})

	t.Run("AppliedAgain_NothingIssued", func(t *testing.T) {
		cluster, progress := newFakeBackstopCluster(), newFakeBackstopProgress()
		require.NoError(t, newTestBackstopApplier(cluster, progress).apply(ctx))
		cluster.statements = nil

		require.NoError(t, newTestBackstopApplier(cluster, progress).apply(ctx))

		assert.Empty(t, cluster.issued())
	})

	t.Run("OtherBackstopDays_AppliedAgain", func(t *testing.T) {
		cluster, progress := newFakeBackstopCluster(), newFakeBackstopProgress()
		require.NoError(t, newTestBackstopApplier(cluster, progress).apply(ctx))
		cluster.statements = nil

		applier := newTestBackstopApplier(cluster, progress)
		applier.days = 10
		require.NoError(t, applier.apply(ctx))

		assert.Len(t, cluster.issued(), 4)
	})

	t.Run("LogsPreconditionFails_NothingIssued", func(t *testing.T) {
		cluster, progress := newFakeBackstopCluster(), newFakeBackstopProgress()
		cluster.coldDays[testLogsTable] = 0

		err := newTestBackstopApplier(cluster, progress).apply(ctx)

		require.Error(t, err)
		assert.Empty(t, cluster.issued(), "every table is checked before any is rewritten")
	})

	t.Run("ColdStorageChangedAfterFirstTable_LogsGetsNewVolume", func(t *testing.T) {
		cluster, progress := newFakeBackstopCluster(), newFakeBackstopProgress()
		cluster.afterExec = func(kind string) {
			if kind == "MATERIALIZE "+testResourceTable {
				cluster.volumes[testLogsTable] = "archive"
			}
		}

		require.NoError(t, newTestBackstopApplier(cluster, progress).apply(ctx))

		require.Len(t, cluster.statements, 4)
		assert.Contains(t, cluster.statements[2], "TO VOLUME 'archive'")
	})

	t.Run("ColdStorageBrokenAfterFirstTable_LogsNotRewritten", func(t *testing.T) {
		cluster, progress := newFakeBackstopCluster(), newFakeBackstopProgress()
		cluster.afterExec = func(kind string) {
			if kind == "MATERIALIZE "+testResourceTable {
				cluster.coldDays[testLogsTable] = 0
			}
		}

		require.Error(t, newTestBackstopApplier(cluster, progress).apply(ctx))

		assert.Equal(t, []string{"MODIFY " + testResourceTable, "MATERIALIZE " + testResourceTable}, cluster.issued())
	})

	t.Run("UnrelatedMutationStuck_NothingIssued", func(t *testing.T) {
		cluster, progress := newFakeBackstopCluster(), newFakeBackstopProgress()
		cluster.tableMutations[testLogsTable] = []retentiontypes.Mutation{{Host: "ch-1", ID: "0000000001", Command: "UPDATE x = 1 WHERE 1", CreateTime: cluster.clock.Add(-time.Hour), FailReason: "Cannot parse"}}

		err := newTestBackstopApplier(cluster, progress).apply(ctx)

		require.Error(t, err)
		assert.Contains(t, err.Error(), "Cannot parse")
		assert.Empty(t, cluster.issued())
	})

	t.Run("OwnMaterializeRetrying_WaitedOn", func(t *testing.T) {
		cluster, progress := newFakeBackstopCluster(), newFakeBackstopProgress()
		cluster.materializeFailReason = "Memory limit exceeded"
		cluster.pendingPolls = 2

		require.NoError(t, newTestBackstopApplier(cluster, progress).apply(ctx))

		assert.Len(t, cluster.issued(), 4, "a failing MATERIALIZE TTL of ours is retried by ClickHouse, not issued again")
	})

	t.Run("OwnMaterializeFinishedAfterInterruption_NotIssuedAgain", func(t *testing.T) {
		cluster, progress := newFakeBackstopCluster(), newFakeBackstopProgress()
		modifiedAt := cluster.clock
		progress.markModified(testResourceTable, 7, modifiedAt)
		progress.markModified(testLogsTable, 7, modifiedAt)
		for _, table := range []string{testResourceTable, testLogsTable} {
			for _, host := range testBackstopHosts {
				cluster.tableMutations[table] = append(cluster.tableMutations[table], retentiontypes.Mutation{Host: host, ID: "0000000002", Command: "MATERIALIZE TTL", CreateTime: modifiedAt.Add(time.Second), Done: true})
			}
		}

		require.NoError(t, newTestBackstopApplier(cluster, progress).apply(ctx))

		assert.Empty(t, cluster.issued())
		assert.True(t, progress.tables[testLogsTable].Done(7))
	})

	t.Run("InterruptedBeforeMaterialize_EarlierMaterializePending_OwnIssuedAfterIt", func(t *testing.T) {
		cluster, progress := newFakeBackstopCluster(), newFakeBackstopProgress()
		modifiedAt := cluster.clock
		progress.markModified(testResourceTable, 7, modifiedAt)
		progress.markModified(testLogsTable, 7, modifiedAt)
		for _, host := range testBackstopHosts {
			cluster.tableMutations[testLogsTable] = append(cluster.tableMutations[testLogsTable], retentiontypes.Mutation{Host: host, ID: "0000000001", Command: "MATERIALIZE TTL", CreateTime: modifiedAt.Add(-time.Minute)})
		}
		cluster.finishEarlierAfterPolls = 2

		require.NoError(t, newTestBackstopApplier(cluster, progress).apply(ctx))

		assert.Equal(t, []string{"MATERIALIZE " + testResourceTable, "MATERIALIZE " + testLogsTable}, cluster.issued(), "a MATERIALIZE TTL older than the backstop doesn't count")
	})
}

func newTestBackstopApplier(cluster *fakeBackstopCluster, progress *fakeBackstopProgress) *backstopApplier {
	return &backstopApplier{
		cluster:      cluster,
		progress:     progress,
		signal:       retentiontypes.LogsTTL,
		days:         7,
		tables:       []string{testResourceTable, testLogsTable},
		clusterName:  "cluster",
		pollInterval: time.Millisecond,
		clause: func(table string, volume string, coldStorageDays int, days int) retentiontypes.TTLClause {
			return retentiontypes.TTLClause{Time: "timestamp", Delete: retentiontypes.IntervalDaysOf("_retention_days"), Backstop: retentiontypes.IntervalDays(days), Volume: volume, MoveAfter: retentiontypes.IntervalDays(coldStorageDays)}
		},
	}
}

type fakeBackstopCluster struct {
	clock                   time.Time
	volumes                 map[string]string
	coldDays                map[string]int
	tableMutations          map[string][]retentiontypes.Mutation
	statements              []string
	failExec                string
	materializeFailReason   string
	pendingPolls            int
	finishEarlierAfterPolls int
	polls                   map[string]int
	afterExec               func(kind string)
}

func newFakeBackstopCluster() *fakeBackstopCluster {
	return &fakeBackstopCluster{
		clock:          time.Date(2026, 11, 2, 10, 0, 0, 0, time.UTC),
		volumes:        map[string]string{testLogsTable: "cold", testResourceTable: "cold"},
		coldDays:       map[string]int{testLogsTable: 3, testResourceTable: 3},
		tableMutations: map[string][]retentiontypes.Mutation{},
		polls:          map[string]int{},
	}
}

func (cluster *fakeBackstopCluster) issued() []string {
	var issued []string
	for _, statement := range cluster.statements {
		issued = append(issued, statementKind(statement))
	}
	return issued
}

func (cluster *fakeBackstopCluster) coldStorage(_ context.Context, table string) (string, int, error) {
	return cluster.volumes[table], cluster.coldDays[table], nil
}

// mutations returns the mutations of table, then moves them along: an earlier MATERIALIZE
// TTL finishes after finishEarlierAfterPolls reads, ours after pendingPolls.
func (cluster *fakeBackstopCluster) mutations(_ context.Context, table string) ([]retentiontypes.Mutation, error) {
	snapshot := append([]retentiontypes.Mutation(nil), cluster.tableMutations[table]...)

	cluster.polls[table]++
	for i, mutation := range cluster.tableMutations[table] {
		if mutation.Done {
			continue
		}
		own := mutation.ID == "own"
		if (own && cluster.polls[table] > cluster.pendingPolls) || (!own && cluster.polls[table] >= cluster.finishEarlierAfterPolls) {
			cluster.tableMutations[table][i].Done = true
			cluster.tableMutations[table][i].FailReason = ""
		}
	}

	return snapshot, nil
}

func (cluster *fakeBackstopCluster) clusterHosts(context.Context) ([]string, error) {
	return testBackstopHosts, nil
}

func (cluster *fakeBackstopCluster) clusterNow(context.Context) (time.Time, error) {
	cluster.clock = cluster.clock.Add(time.Second)
	return cluster.clock, nil
}

func (cluster *fakeBackstopCluster) exec(_ context.Context, statement string) error {
	kind := statementKind(statement)
	if kind == cluster.failExec {
		return errors.Newf(errors.TypeInternal, errors.CodeInternal, "%s timed out", kind)
	}
	cluster.statements = append(cluster.statements, statement)

	if strings.HasPrefix(kind, "MATERIALIZE ") {
		table := strings.TrimPrefix(kind, "MATERIALIZE ")
		cluster.clock = cluster.clock.Add(time.Second)
		cluster.polls[table] = 0
		for _, host := range testBackstopHosts {
			cluster.tableMutations[table] = append(cluster.tableMutations[table], retentiontypes.Mutation{Host: host, ID: "own", Command: "MATERIALIZE TTL", CreateTime: cluster.clock, FailReason: cluster.materializeFailReason})
		}
	}
	if cluster.afterExec != nil {
		cluster.afterExec(kind)
	}
	return nil
}

func statementKind(statement string) string {
	table := strings.Fields(statement)[2]
	if strings.Contains(statement, "MATERIALIZE TTL") {
		return "MATERIALIZE " + table
	}
	return "MODIFY " + table
}

type fakeBackstopProgress struct {
	tables map[string]*archivetypes.BackstopTable
}

func newFakeBackstopProgress() *fakeBackstopProgress {
	return &fakeBackstopProgress{tables: map[string]*archivetypes.BackstopTable{}}
}

func (progress *fakeBackstopProgress) markModified(table string, days int, modifiedAt time.Time) {
	record := archivetypes.NewBackstopTable(retentiontypes.LogsTTL, table, days)
	record.ModifiedAt = &modifiedAt
	progress.tables[table] = record
}

func (progress *fakeBackstopProgress) GetBackstopTable(_ context.Context, _ string, table string) (*archivetypes.BackstopTable, error) {
	record, ok := progress.tables[table]
	if !ok {
		return nil, errors.Newf(errors.TypeNotFound, archivetypes.ErrCodeBackstopTableNotFound, "no progress on %s", table)
	}
	copied := *record
	return &copied, nil
}

func (progress *fakeBackstopProgress) SetBackstopTable(_ context.Context, record *archivetypes.BackstopTable) error {
	copied := *record
	progress.tables[record.TableName] = &copied
	return nil
}
