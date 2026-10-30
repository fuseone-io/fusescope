package archivetypes

import (
	"encoding/json"
	"time"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/types"
	"github.com/fuseone-io/fusescope/pkg/valuer"
	"github.com/uptrace/bun"
)

const (
	AttemptKindExport = "export"

	AttemptStatusPending   = "pending"
	AttemptStatusPublished = "published"
	AttemptStatusAbandoned = "abandoned"

	ObjectStatusActive     = "active"
	ObjectStatusSuperseded = "superseded"

	PartStatusPublished  = "published"
	PartStatusSuperseded = "superseded"
)

var (
	ErrCodeLeaseLost               = errors.MustNewCode("archive_lease_lost")
	ErrCodeAttemptNotPending       = errors.MustNewCode("archive_attempt_not_pending")
	ErrCodeAttemptAlreadyPublished = errors.MustNewCode("archive_attempt_already_published")
	ErrCodePartAlreadyPublished    = errors.MustNewCode("archive_part_already_published")
	ErrCodeInvalidPublication      = errors.MustNewCode("archive_invalid_publication")
)

// Attempt is one export of a table's partition on one shard. Its objects are written under
// its ID, so an attempt that is never published leaves only orphans to collect.
type Attempt struct {
	bun.BaseModel `bun:"table:archive_attempt,alias:archive_attempt"`

	types.Identifiable
	types.TimeAuditable
	Signal          string `bun:"signal"`
	Kind            string `bun:"kind"`
	TableName       string `bun:"table_name"`
	Shard           int    `bun:"shard"`
	PartitionID     string `bun:"partition_id"`
	Epoch           int64  `bun:"epoch"`
	Status          string `bun:"status"`
	NamedCollection string `bun:"named_collection"`
	Prefix          string `bun:"prefix"`
	FormatVersion   int    `bun:"format_version"`
	ColumnMapping   string `bun:"column_mapping"`
	ManifestKey     string `bun:"manifest_key"`
	ManifestSHA256  string `bun:"manifest_sha256"`
}

// Object is a file in the bucket, as checked at commit.
type Object struct {
	bun.BaseModel `bun:"table:archive_object,alias:archive_object"`

	types.Identifiable
	types.TimeAuditable
	AttemptID       valuer.UUID `bun:"attempt_id"`
	NamedCollection string      `bun:"named_collection"`
	ObjectKey       string      `bun:"object_key"`
	Bytes           int64       `bun:"bytes"`
	ETag            string      `bun:"etag"`
	Rows            int64       `bun:"rows"`
	Status          string      `bun:"status"`
}

// ArchivedPart is a published part and the object that holds its rows.
type ArchivedPart struct {
	bun.BaseModel `bun:"table:archive_part,alias:archive_part"`

	types.Identifiable
	types.TimeAuditable
	TableName   string      `bun:"table_name"`
	Shard       int         `bun:"shard"`
	PartitionID string      `bun:"partition_id"`
	PartName    string      `bun:"part_name"`
	MinBlock    int64       `bun:"min_block"`
	MaxBlock    int64       `bun:"max_block"`
	DataVersion int64       `bun:"data_version"`
	Rows        int64       `bun:"rows"`
	ObjectID    valuer.UUID `bun:"object_id"`
	AttemptID   valuer.UUID `bun:"attempt_id"`
	Status      string      `bun:"status"`
	DroppedAt   *time.Time  `bun:"dropped_at"`
}

// Publication is what an attempt commits: its objects, and the parts each one holds.
type Publication struct {
	Attempt *Attempt
	Objects []*Object
	Parts   []*ArchivedPart
}

// IndexSnapshot is a table's active objects as of its Sequence-th commit.
type IndexSnapshot struct {
	Sequence int64
	Objects  []*Object
}

func NewExportAttempt(lease *Lease, table string, shard int, partitionID string, namedCollection string, prefix string) *Attempt {
	now := time.Now()
	return &Attempt{
		Identifiable:    types.Identifiable{ID: valuer.GenerateUUID()},
		TimeAuditable:   types.TimeAuditable{CreatedAt: now, UpdatedAt: now},
		Signal:          lease.Signal,
		Kind:            AttemptKindExport,
		TableName:       table,
		Shard:           shard,
		PartitionID:     partitionID,
		Epoch:           lease.Epoch,
		Status:          AttemptStatusPending,
		NamedCollection: namedCollection,
		Prefix:          prefix,
	}
}

func NewObject(attempt *Attempt, objectKey string, bytes int64, etag string, rows int64) *Object {
	now := time.Now()
	return &Object{
		Identifiable:    types.Identifiable{ID: valuer.GenerateUUID()},
		TimeAuditable:   types.TimeAuditable{CreatedAt: now, UpdatedAt: now},
		AttemptID:       attempt.ID,
		NamedCollection: attempt.NamedCollection,
		ObjectKey:       objectKey,
		Bytes:           bytes,
		ETag:            etag,
		Rows:            rows,
		Status:          ObjectStatusActive,
	}
}

func NewArchivedPart(attempt *Attempt, object *Object, part Part) *ArchivedPart {
	now := time.Now()
	return &ArchivedPart{
		Identifiable:  types.Identifiable{ID: valuer.GenerateUUID()},
		TimeAuditable: types.TimeAuditable{CreatedAt: now, UpdatedAt: now},
		TableName:     attempt.TableName,
		Shard:         attempt.Shard,
		PartitionID:   attempt.PartitionID,
		PartName:      part.Name,
		MinBlock:      part.Range.Min,
		MaxBlock:      part.Range.Max,
		DataVersion:   part.DataVersion,
		Rows:          int64(part.Rows),
		ObjectID:      object.ID,
		AttemptID:     attempt.ID,
		Status:        PartStatusPublished,
	}
}

// SetFormat records how the attempt's columns were exported and where its manifest is.
func (attempt *Attempt) SetFormat(mappings []ColumnMapping, manifestKey string, manifestSHA256 string) error {
	encoded, err := json.Marshal(mappings)
	if err != nil {
		return errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "couldn't encode the column mapping of attempt %s", attempt.ID)
	}

	attempt.FormatVersion = FormatVersion
	attempt.ColumnMapping = string(encoded)
	attempt.ManifestKey = manifestKey
	attempt.ManifestSHA256 = manifestSHA256
	return nil
}

func (part *ArchivedPart) Part() Part {
	return Part{Name: part.PartName, Range: BlockRange{Min: part.MinBlock, Max: part.MaxBlock}, DataVersion: part.DataVersion, Rows: uint64(part.Rows)}
}

func PartsOf(archived []*ArchivedPart) []Part {
	parts := make([]Part, len(archived))
	for i, part := range archived {
		parts[i] = part.Part()
	}
	return parts
}

// Validate checks that the attempt is ready to commit and that every object and part belongs
// to it.
func (publication *Publication) Validate() error {
	attempt := publication.Attempt
	if attempt == nil || attempt.FormatVersion == 0 || attempt.ColumnMapping == "" || attempt.ManifestKey == "" || attempt.ManifestSHA256 == "" {
		return errors.New(errors.TypeInvalidInput, ErrCodeInvalidPublication, "the publication's attempt has no format, column mapping or manifest")
	}

	objects := make(map[valuer.UUID]bool, len(publication.Objects))
	for _, object := range publication.Objects {
		if object.AttemptID != attempt.ID {
			return errors.Newf(errors.TypeInvalidInput, ErrCodeInvalidPublication, "object %s isn't of archive attempt %s", object.ObjectKey, attempt.ID)
		}
		objects[object.ID] = true
	}
	for _, part := range publication.Parts {
		if part.AttemptID != attempt.ID || part.TableName != attempt.TableName || part.Shard != attempt.Shard || part.PartitionID != attempt.PartitionID || !objects[part.ObjectID] {
			return errors.Newf(errors.TypeInvalidInput, ErrCodeInvalidPublication, "part %s isn't of archive attempt %s on %s shard %d partition %s, or its object isn't published with it", part.PartName, attempt.ID, attempt.TableName, attempt.Shard, attempt.PartitionID)
		}
	}

	return nil
}
