package archivetypes

import (
	"testing"
	"time"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/valuer"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestPartitionPastRetention(t *testing.T) {
	day := time.Date(2026, 9, 3, 0, 0, 0, 0, time.UTC)

	testCases := []struct {
		name string
		now  time.Time
		want bool
	}{
		{name: "LastRowStillInRetention", now: time.Date(2026, 9, 18, 23, 59, 59, 0, time.UTC), want: false},
		{name: "LastRowPastRetention", now: time.Date(2026, 9, 19, 0, 0, 0, 0, time.UTC), want: true},
		{name: "LongPastRetention", now: time.Date(2027, 1, 1, 0, 0, 0, 0, time.UTC), want: true},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			assert.Equal(t, testCase.want, Partition{ID: "20260903-15-0", Day: day, RetentionDays: 15}.PastRetention(testCase.now))
		})
	}
}

func TestExportStatement(t *testing.T) {
	mappings := []ColumnMapping{
		{Name: "timestamp", SourceType: "UInt64", ExportType: "Int64"},
		{Name: "body", SourceType: "String", ExportType: "String"},
	}

	got := ExportStatement(Table{Database: "signoz_logs", Name: "logs_v2"}, mappings, "archive", 2, "20260903-15-0_1_5_1", "fusescope/logs_v2/x's.parquet")

	assert.Equal(t, "INSERT INTO FUNCTION s3(`archive`, filename = 'fusescope/logs_v2/x\\'s.parquet', format = 'Parquet') "+
		"SELECT CAST(`timestamp`, 'Int64') AS `timestamp`, `body`, toInt32(2) AS `_shard`, _part AS `_part` "+
		"FROM `signoz_logs`.`logs_v2` WHERE _part = '20260903-15-0_1_5_1'", got)
}

func TestObjectStatements(t *testing.T) {
	assert.Equal(t, "SELECT _file, toUInt64(ifNull(_size, 0)), toString(ifNull(_etag, '')), count(), groupUniqArray(_part) FROM s3(`archive`, filename = 'fusescope/logs_v2/attempt/*.parquet', format = 'Parquet', structure = '_part String') GROUP BY ALL",
		StatObjectsStatement("archive", "fusescope/logs_v2/attempt"))
	assert.Equal(t, "INSERT INTO FUNCTION s3(`archive`, filename = 'm\\'s.json', format = 'RawBLOB', structure = 'raw String') SELECT raw FROM blob",
		WriteBlobStatement("archive", "m's.json"))
	assert.Equal(t, "SELECT _file FROM s3(`archive`, filename = 'fusescope/logs_v2/index/*.json', format = 'One')",
		ListIndexesStatement("archive", "fusescope/", "logs_v2"))
}

func TestNewPublication(t *testing.T) {
	attempt := &Attempt{TableName: "logs_v2", Shard: 1, PartitionID: "20260903-15-0", NamedCollection: "archive"}
	attempt.ID = valuer.GenerateUUID()
	location := ObjectLocation{Prefix: "fusescope", Table: "logs_v2", Day: time.Date(2026, 9, 3, 0, 0, 0, 0, time.UTC), Shard: 1, PartitionID: "20260903-15-0", AttemptID: attempt.ID.StringValue()}
	parts := []Part{
		{Name: "20260903-15-0_1_5_1", Range: BlockRange{Min: 1, Max: 5}, DataVersion: 1, Rows: 10},
		{Name: "20260903-15-0_6_6_0", Range: BlockRange{Min: 6, Max: 6}, DataVersion: 6, Rows: 2},
	}

	testCases := []struct {
		name  string
		stats []ObjectStat
		err   bool
	}{
		{name: "EveryPartWithItsRows", stats: []ObjectStat{{File: "20260903-15-0_6_6_0.parquet", Bytes: 100, ETag: `"b"`, Rows: 2, Parts: []string{"20260903-15-0_6_6_0"}}, {File: "20260903-15-0_1_5_1.parquet", Bytes: 200, ETag: `"a"`, Rows: 10, Parts: []string{"20260903-15-0_1_5_1"}}}},
		{name: "PartMergedAwayDuringTheRead", stats: []ObjectStat{{File: "20260903-15-0_1_5_1.parquet", Bytes: 200, ETag: `"a"`, Rows: 10, Parts: []string{"20260903-15-0_1_5_1"}}}, err: true},
		{name: "RowCountDiffers", stats: []ObjectStat{{File: "20260903-15-0_1_5_1.parquet", Rows: 9, Parts: []string{"20260903-15-0_1_5_1"}}, {File: "20260903-15-0_6_6_0.parquet", Rows: 2, Parts: []string{"20260903-15-0_6_6_0"}}}, err: true},
		{name: "ObjectHoldsAnotherPart", stats: []ObjectStat{{File: "20260903-15-0_1_5_1.parquet", Rows: 10, Parts: []string{"20260903-15-0_1_4_1"}}, {File: "20260903-15-0_6_6_0.parquet", Rows: 2, Parts: []string{"20260903-15-0_6_6_0"}}}, err: true},
		{name: "ObjectHoldsTwoParts", stats: []ObjectStat{{File: "20260903-15-0_1_5_1.parquet", Rows: 10, Parts: []string{"20260903-15-0_1_5_1", "20260903-15-0_6_6_0"}}, {File: "20260903-15-0_6_6_0.parquet", Rows: 2, Parts: []string{"20260903-15-0_6_6_0"}}}, err: true},
		{name: "UnexpectedObject", stats: []ObjectStat{{File: "20260903-15-0_1_5_1.parquet", Rows: 10, Parts: []string{"20260903-15-0_1_5_1"}}, {File: "20260903-15-0_6_6_0.parquet", Rows: 2, Parts: []string{"20260903-15-0_6_6_0"}}, {File: "other.parquet", Rows: 1, Parts: []string{"other"}}}, err: true},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			publication, err := NewPublication(attempt, location, parts, testCase.stats)
			if testCase.err {
				assert.True(t, errors.Asc(err, ErrCodeObjectMismatch), err)
				return
			}
			require.NoError(t, err)

			require.Len(t, publication.Objects, 2)
			require.Len(t, publication.Parts, 2)
			assert.Equal(t, location.ObjectKey("20260903-15-0_1_5_1"), publication.Objects[0].ObjectKey)
			assert.Equal(t, "a", publication.Objects[0].ETag)
			assert.Equal(t, int64(200), publication.Objects[0].Bytes)
			assert.Equal(t, publication.Objects[0].ID, publication.Parts[0].ObjectID)
			assert.Equal(t, parts, PartsOf(publication.Parts))
		})
	}
}

func TestPublicationManifest(t *testing.T) {
	attempt := &Attempt{TableName: "logs_v2", Shard: 1, PartitionID: "20260903-15-0", NamedCollection: "archive"}
	attempt.ID = valuer.GenerateUUID()
	location := ObjectLocation{Prefix: "fusescope", Table: "logs_v2", Day: time.Date(2026, 9, 3, 0, 0, 0, 0, time.UTC), Shard: 1, PartitionID: "20260903-15-0", AttemptID: attempt.ID.StringValue()}
	parts := []Part{{Name: "20260903-15-0_1_5_1", Range: BlockRange{Min: 1, Max: 5}, DataVersion: 1, Rows: 10}}
	publication, err := NewPublication(attempt, location, parts, []ObjectStat{{File: "20260903-15-0_1_5_1.parquet", Bytes: 200, ETag: "a", Rows: 10, Parts: []string{"20260903-15-0_1_5_1"}}})
	require.NoError(t, err)
	mappings := []ColumnMapping{{Name: "timestamp", SourceType: "UInt64", ExportType: "Int64"}}

	assert.Equal(t, Manifest{
		FormatVersion:   FormatVersion,
		MigratorVersion: "1001",
		Table:           "logs_v2",
		Shard:           1,
		PartitionID:     "20260903-15-0",
		Day:             "2026-09-03",
		AttemptID:       attempt.ID.StringValue(),
		Columns:         mappings,
		Parts:           []ManifestPart{{Name: "20260903-15-0_1_5_1", MinBlock: 1, MaxBlock: 5, DataVersion: 1, Rows: 10, ObjectKey: location.ObjectKey("20260903-15-0_1_5_1"), Bytes: 200, ETag: "a"}},
	}, publication.Manifest(location, "1001", mappings))
}

func TestNewIndex(t *testing.T) {
	objects := []*Object{{ObjectKey: "b", Bytes: 2, ETag: "e2", Rows: 20}, {ObjectKey: "a", Bytes: 1, ETag: "e1", Rows: 10}}

	assert.Equal(t, Index{Table: "logs_v2", Epoch: 3, Sequence: 12, Objects: []IndexObject{{Key: "a", Rows: 10, Bytes: 1, ETag: "e1"}, {Key: "b", Rows: 20, Bytes: 2, ETag: "e2"}}}, NewIndex("logs_v2", 3, &IndexSnapshot{Sequence: 12, Objects: objects}))
}
