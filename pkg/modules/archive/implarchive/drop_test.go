package implarchive

import (
	"context"
	"path"
	"regexp"
	"slices"
	"testing"

	"github.com/ClickHouse/ch-go/proto"
	"github.com/ClickHouse/clickhouse-go/v2"
	cmock "github.com/SigNoz/clickhouse-go-mock"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/types/archivetypes"
)

func TestDropArchived(t *testing.T) {
	ctx := context.Background()
	partitionID := "20260904-15-0"
	part := func(name string, minBlock int64, maxBlock int64, dataVersion int64) archivetypes.Part {
		return archivetypes.Part{Name: name, Range: archivetypes.BlockRange{Min: minBlock, Max: maxBlock}, DataVersion: dataVersion, Rows: 10}
	}
	published := []archivetypes.Part{part("20260904-15-0_1_3_1", 1, 3, 1), part("20260904-15-0_4_5_1", 4, 5, 4)}
	noSuchPart := &clickhouse.Exception{Code: int32(proto.ErrNoSuchDataPart), Message: "no such part"}
	locked := &clickhouse.Exception{Code: int32(proto.ErrPartIsTemporarilyLocked), Message: "part is locked"}

	testCases := []struct {
		name        string
		replicaPath string
		rounds      [][]archivetypes.Part
		dropErrs    map[string]error
		changed     map[string][]any
		wantDropped []string
		wantErr     bool
	}{
		{name: "PublishedParts_Dropped", rounds: [][]archivetypes.Part{published}, wantDropped: []string{"20260904-15-0_1_3_1", "20260904-15-0_4_5_1"}},
		{name: "MergeOfPublishedParts_Dropped", rounds: [][]archivetypes.Part{{part("20260904-15-0_1_5_2", 1, 5, 1)}}, wantDropped: []string{"20260904-15-0_1_5_2"}},
		{name: "PartCommittedAfterTheSnapshot_Kept", rounds: [][]archivetypes.Part{{published[0], part("20260904-15-0_6_6_0", 6, 6, 6)}}, wantDropped: []string{"20260904-15-0_1_3_1"}},
		{name: "MergeFoldingInAnUnexportedPart_Kept", rounds: [][]archivetypes.Part{{part("20260904-15-0_1_6_2", 1, 6, 1)}}},
		{name: "PartMutatedAfterPublication_Kept", rounds: [][]archivetypes.Part{{part("20260904-15-0_1_3_1_9", 1, 3, 9)}}},
		{
			name:        "PartMergedAwayBeforeItsDrop_NewSnapshot",
			rounds:      [][]archivetypes.Part{published, {part("20260904-15-0_1_5_2", 1, 5, 1)}},
			dropErrs:    map[string]error{"20260904-15-0_1_3_1": noSuchPart, "20260904-15-0_4_5_1": noSuchPart},
			wantDropped: []string{"20260904-15-0_1_5_2"},
		},
		{
			name:        "ObjectSizeChanged_PartKept",
			rounds:      [][]archivetypes.Part{published},
			changed:     map[string][]any{"20260904-15-0_1_3_1": {"20260904-15-0_1_3_1.parquet", uint64(512), `"etag"`}},
			wantDropped: []string{"20260904-15-0_4_5_1"},
		},
		{
			name:        "ObjectMissing_PartKept",
			rounds:      [][]archivetypes.Part{published},
			changed:     map[string][]any{"20260904-15-0_4_5_1": nil},
			wantDropped: []string{"20260904-15-0_1_3_1"},
		},
		{
			name:    "ObjectOfASourcePartChanged_MergeKept",
			rounds:  [][]archivetypes.Part{{part("20260904-15-0_1_5_2", 1, 5, 1)}},
			changed: map[string][]any{"20260904-15-0_4_5_1": {"20260904-15-0_4_5_1.parquet", uint64(1024), `"rewritten"`}},
		},
		{
			name:        "PartLocked_SkippedUntilTheNextCycle",
			rounds:      [][]archivetypes.Part{published},
			dropErrs:    map[string]error{"20260904-15-0_1_3_1": locked},
			wantDropped: []string{"20260904-15-0_4_5_1"},
		},
		{name: "ReplicaHoldsOtherData_NothingDropped", replicaPath: "/clickhouse/tables/recreated/01", rounds: [][]archivetypes.Part{{}}, wantErr: true},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			archiveStore := newTestStore(t)
			service := newTestExportService(t, archiveStore)
			lease := acquireTestLease(t, archiveStore)
			pin := testShardPin(t, archiveStore)
			publication := newTestPublicationOf(t, archiveStore, lease, partitionID, published...)
			publishTest(t, archiveStore, lease, publication)
			verified := slices.DeleteFunc(slices.Clone(published), func(p archivetypes.Part) bool { _, ok := testCase.changed[p.Name]; return ok })
			var bucket [][]any
			for _, p := range published {
				row, ok := testCase.changed[p.Name]
				if !ok {
					row = []any{p.Name + ".parquet", uint64(1024), `"etag"`}
				}
				if row != nil {
					bucket = append(bucket, row)
				}
			}

			conn := newMockConn(t)
			replicaPath := pin.ReplicaPath
			if testCase.replicaPath != "" {
				replicaPath = testCase.replicaPath
			}
			for _, current := range testCase.rounds {
				expectReplica(conn, 1, "ReplicatedMergeTree", replicaPath)
				if testCase.wantErr {
					break
				}
				expectPartitionParts(conn, partitionID, current...)
				if len(archivetypes.SelectForDrop(current, published)) > 0 {
					expectObjects(conn, publication, bucket...)
				}
				for _, selected := range archivetypes.SelectForDrop(current, verified) {
					expected := conn.ExpectExec("DROP PART '" + selected.Name + "'")
					if dropErr, ok := testCase.dropErrs[selected.Name]; ok {
						expected.WillReturnError(dropErr)
					}
				}
			}

			job := exportJob{table: testLogsTable, partition: archivetypes.Partition{ID: partitionID}, shard: 1, pin: pin}
			err := service.dropArchived(ctx, job, replica{shard: 1, replica: 1, addr: "ch-1:9000", conn: asConn(conn)})
			if testCase.wantErr {
				assert.True(t, errors.Asc(err, archivetypes.ErrCodeShardMismatch), err)
				return
			}
			require.NoError(t, err)

			parts, err := archiveStore.ListPublishedParts(ctx, pin, partitionID)
			require.NoError(t, err)
			droppedRanges := make([]archivetypes.BlockRange, 0)
			for _, selected := range testCase.wantDropped {
				for _, current := range testCase.rounds[len(testCase.rounds)-1] {
					if current.Name == selected {
						droppedRanges = append(droppedRanges, current.Range)
					}
				}
			}
			for _, archived := range parts {
				wantDropped := archivetypes.NewBlockRanges(droppedRanges...).Covers(archived.Part().Range)
				assert.Equal(t, wantDropped, archived.DroppedAt != nil, archived.PartName)
			}
		})
	}
}

func TestDropArchivedStopsOnAFailedDrop(t *testing.T) {
	ctx := context.Background()
	archiveStore := newTestStore(t)
	service := newTestExportService(t, archiveStore)
	lease := acquireTestLease(t, archiveStore)
	pin := testShardPin(t, archiveStore)
	first := archivetypes.Part{Name: "20260905-15-0_1_1_0", Range: archivetypes.BlockRange{Min: 1, Max: 1}, DataVersion: 1, Rows: 3}
	second := archivetypes.Part{Name: "20260905-15-0_2_2_0", Range: archivetypes.BlockRange{Min: 2, Max: 2}, DataVersion: 2, Rows: 4}
	publication := newTestPublicationOf(t, archiveStore, lease, "20260905-15-0", first, second)
	publishTest(t, archiveStore, lease, publication)

	conn := newMockConn(t)
	expectReplica(conn, 1, "ReplicatedMergeTree", pin.ReplicaPath)
	expectPartitionParts(conn, "20260905-15-0", first, second)
	expectObjects(conn, publication, []any{first.Name + ".parquet", uint64(1024), `"etag"`}, []any{second.Name + ".parquet", uint64(1024), `"etag"`})
	conn.ExpectExec("DROP PART '20260905-15-0_1_1_0'")
	conn.ExpectExec("DROP PART '20260905-15-0_2_2_0'").WillReturnError(&clickhouse.Exception{Code: int32(proto.ErrTimeoutExceeded), Message: "timeout"})

	job := exportJob{table: testLogsTable, partition: archivetypes.Partition{ID: "20260905-15-0"}, shard: 1, pin: pin}
	err := service.dropArchived(ctx, job, replica{shard: 1, replica: 1, addr: "ch-1:9000", conn: asConn(conn)})
	assert.Error(t, err)

	parts, err := archiveStore.ListPublishedParts(ctx, pin, "20260905-15-0")
	require.NoError(t, err)
	require.Len(t, parts, 2)
	assert.NotNil(t, parts[0].DroppedAt, "a part dropped before the failure is recorded")
	assert.Nil(t, parts[1].DroppedAt)
}

func TestDropArchivedStopsOnceTheLeaseIsLost(t *testing.T) {
	ctx, loseLease := context.WithCancel(context.Background())
	defer loseLease()
	archiveStore := newTestStore(t)
	service := newTestExportService(t, archiveStore)
	lease := acquireTestLease(t, archiveStore)
	pin := testShardPin(t, archiveStore)
	first := archivetypes.Part{Name: "20260906-15-0_1_1_0", Range: archivetypes.BlockRange{Min: 1, Max: 1}, DataVersion: 1, Rows: 3}
	second := archivetypes.Part{Name: "20260906-15-0_2_2_0", Range: archivetypes.BlockRange{Min: 2, Max: 2}, DataVersion: 2, Rows: 4}
	publication := newTestPublicationOf(t, archiveStore, lease, "20260906-15-0", first, second)
	publishTest(t, archiveStore, lease, publication)

	conn := newMockConn(t)
	expectReplica(conn, 1, "ReplicatedMergeTree", pin.ReplicaPath)
	expectPartitionParts(conn, "20260906-15-0", first, second)
	expectObjects(conn, publication, []any{first.Name + ".parquet", uint64(1024), `"etag"`}, []any{second.Name + ".parquet", uint64(1024), `"etag"`})
	conn.ExpectExec("DROP PART '20260906-15-0_1_1_0'")

	job := exportJob{table: testLogsTable, partition: archivetypes.Partition{ID: "20260906-15-0"}, shard: 1, pin: pin}
	err := service.dropArchived(ctx, job, replica{shard: 1, replica: 1, addr: "ch-1:9000", conn: losesLeaseOnExec{Conn: asConn(conn), loseLease: loseLease}})
	assert.ErrorIs(t, err, context.Canceled)

	parts, err := archiveStore.ListPublishedParts(context.Background(), pin, "20260906-15-0")
	require.NoError(t, err)
	require.Len(t, parts, 2)
	assert.NotNil(t, parts[0].DroppedAt, "a part dropped before the lease was lost is recorded")
	assert.Nil(t, parts[1].DroppedAt)
}

type losesLeaseOnExec struct {
	clickhouse.Conn
	loseLease context.CancelFunc
}

func (conn losesLeaseOnExec) Exec(ctx context.Context, query string, args ...any) error {
	err := conn.Conn.Exec(ctx, query, args...)
	conn.loseLease()
	return err
}

func expectObjects(conn cmock.ClickConnMockCommon, publication *archivetypes.Publication, rows ...[]any) {
	dir := path.Dir(publication.Objects[0].ObjectKey)
	conn.ExpectQuery(regexp.QuoteMeta(dir+"/*.parquet") + ".*format = 'One'").WillReturnRows(cmock.NewRows(statColumns[:3], rows))
}
