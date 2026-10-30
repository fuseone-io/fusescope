package archivetypes

import (
	"fmt"
	"maps"
	"slices"
	"strings"
	"time"

	"github.com/fuseone-io/fusescope/pkg/clickhousesql"
	"github.com/fuseone-io/fusescope/pkg/errors"
)

var ErrCodeObjectMismatch = errors.MustNewCode("archive_object_mismatch")

// Table is a local MergeTree table whose partition key starts with the day and the
// retention in days.
type Table struct {
	Database string
	Name     string
}

// Partition is one partition of a table, with its day and retention read from
// _partition_value: system.parts.min_date is not set for a key computed from a timestamp.
type Partition struct {
	ID            string
	Day           time.Time
	RetentionDays int
}

// ObjectStat is an exported object as read back from the bucket.
type ObjectStat struct {
	File  string
	Bytes int64
	ETag  string
	Rows  int64
	Parts []string
}

func LogsTables() []Table {
	return []Table{{Database: "signoz_logs", Name: "logs_v2"}, {Database: "signoz_logs", Name: "logs_v2_resource"}}
}

// PastRetention reports whether the partition's last possible row is older than its
// retention.
func (partition Partition) PastRetention(now time.Time) bool {
	return !now.Before(partition.Day.AddDate(0, 0, partition.RetentionDays+1))
}

// ExportStatement writes one part to key, with the _shard and _part columns that let
// external readers ignore the path. Without s3_truncate_on_insert an existing key fails it.
func ExportStatement(table Table, mappings []ColumnMapping, namedCollection string, shard int, part string, key string) string {
	expressions := ExportExpressions(mappings, shard)

	return fmt.Sprintf("INSERT INTO FUNCTION s3(%s, filename = %s, format = 'Parquet') SELECT %s FROM %s.%s WHERE _part = %s",
		clickhousesql.Identifier(namedCollection), clickhousesql.StringLiteral(key), strings.Join(expressions, ", "),
		clickhousesql.Identifier(table.Database), clickhousesql.Identifier(table.Name), clickhousesql.StringLiteral(part))
}

// StatObjectsStatement reads the size, ETag, row count and _part values of every object under
// dir. The structure lets an empty dir return no rows instead of failing.
func StatObjectsStatement(namedCollection string, dir string) string {
	return fmt.Sprintf("SELECT _file, toUInt64(ifNull(_size, 0)), toString(ifNull(_etag, '')), count(), groupUniqArray(_part) FROM s3(%s, filename = %s, format = 'Parquet', structure = '_part String') GROUP BY ALL",
		clickhousesql.Identifier(namedCollection), clickhousesql.StringLiteral(strings.TrimSuffix(dir, "/")+"/*.parquet"))
}

// WriteBlobStatement writes the raw column of the external table blob, sent with the query,
// as the object at key: as a literal the content would be bound by max_query_size.
func WriteBlobStatement(namedCollection string, key string) string {
	return fmt.Sprintf("INSERT INTO FUNCTION s3(%s, filename = %s, format = 'RawBLOB', structure = 'raw String') SELECT raw FROM blob",
		clickhousesql.Identifier(namedCollection), clickhousesql.StringLiteral(key))
}

// ListIndexesStatement lists the table's index objects by file name, without reading them.
func ListIndexesStatement(namedCollection string, prefix string, table string) string {
	return fmt.Sprintf("SELECT _file FROM s3(%s, filename = %s, format = 'One')",
		clickhousesql.Identifier(namedCollection), clickhousesql.StringLiteral(fmt.Sprintf("%s/%s/index/*.json", strings.TrimSuffix(prefix, "/"), table)))
}

// NewPublication pairs each exported part with its object. Every part must have an object
// holding exactly its rows, and no other object may be under the attempt: a part merged
// away during the export reads back short.
func NewPublication(attempt *Attempt, location ObjectLocation, parts []Part, stats []ObjectStat) (*Publication, error) {
	byFile := make(map[string]ObjectStat, len(stats))
	for _, stat := range stats {
		byFile[stat.File] = stat
	}

	publication := &Publication{Attempt: attempt}
	for _, part := range parts {
		stat, ok := byFile[part.Name+".parquet"]
		if !ok || stat.Rows != int64(part.Rows) {
			return nil, errors.Newf(errors.TypeInternal, ErrCodeObjectMismatch, "archive attempt %s read back %d rows of part %s, which has %d", attempt.ID, stat.Rows, part.Name, part.Rows)
		}
		if !slices.Equal(stat.Parts, []string{part.Name}) {
			return nil, errors.Newf(errors.TypeInternal, ErrCodeObjectMismatch, "archive attempt %s read back rows of parts %v in the object of part %s", attempt.ID, stat.Parts, part.Name)
		}
		delete(byFile, part.Name+".parquet")

		object := NewObject(attempt, location.ObjectKey(part.Name), stat.Bytes, strings.Trim(stat.ETag, `"`), stat.Rows)
		publication.Objects = append(publication.Objects, object)
		publication.Parts = append(publication.Parts, NewArchivedPart(attempt, object, part))
	}
	if len(byFile) > 0 {
		return nil, errors.Newf(errors.TypeInternal, ErrCodeObjectMismatch, "archive attempt %s wrote unexpected objects %v", attempt.ID, slices.Sorted(maps.Keys(byFile)))
	}

	return publication, nil
}

func (publication *Publication) Manifest(location ObjectLocation, migratorVersion string, mappings []ColumnMapping) Manifest {
	attempt := publication.Attempt
	parts := make([]ManifestPart, len(publication.Parts))
	for i, part := range publication.Parts {
		object := publication.Objects[i]
		parts[i] = ManifestPart{Name: part.PartName, MinBlock: part.MinBlock, MaxBlock: part.MaxBlock, DataVersion: part.DataVersion, Rows: uint64(part.Rows), ObjectKey: object.ObjectKey, Bytes: uint64(object.Bytes), ETag: object.ETag}
	}

	return Manifest{
		FormatVersion:   FormatVersion,
		MigratorVersion: migratorVersion,
		Table:           attempt.TableName,
		Shard:           attempt.Shard,
		PartitionID:     attempt.PartitionID,
		Day:             location.Day.Format(time.DateOnly),
		AttemptID:       attempt.ID.StringValue(),
		Columns:         mappings,
		Parts:           parts,
	}
}

func NewIndex(table string, epoch int64, snapshot *IndexSnapshot) Index {
	entries := make([]IndexObject, len(snapshot.Objects))
	for i, object := range snapshot.Objects {
		entries[i] = IndexObject{Key: object.ObjectKey, Rows: uint64(object.Rows), Bytes: uint64(object.Bytes), ETag: object.ETag}
	}
	slices.SortFunc(entries, func(a, b IndexObject) int { return strings.Compare(a.Key, b.Key) })

	return Index{Table: table, Epoch: epoch, Sequence: snapshot.Sequence, Objects: entries}
}
