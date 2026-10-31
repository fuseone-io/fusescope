package archivetypes

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"path"
	"strconv"
	"strings"
	"time"

	"github.com/fuseone-io/fusescope/pkg/errors"
)

// ObjectLocation is where one attempt writes its objects and manifest. Table has no
// database; Day is the first element of the partition key.
type ObjectLocation struct {
	Prefix      string
	Table       string
	Day         time.Time
	Shard       int
	PartitionID string
	AttemptID   string
}

// Manifest lists, for external readers, the objects one attempt wrote. Restores don't read
// it: SQL is the source of truth (ADR 0002 §9).
type Manifest struct {
	FormatVersion   int             `json:"format_version"`
	MigratorVersion string          `json:"migrator_version"`
	Table           string          `json:"table"`
	Shard           int             `json:"shard"`
	PartitionID     string          `json:"partition_id"`
	Day             string          `json:"day"`
	AttemptID       string          `json:"attempt_id"`
	Columns         []ColumnMapping `json:"columns"`
	Parts           []ManifestPart  `json:"parts"`
}

type ManifestPart struct {
	Name        string `json:"name"`
	MinBlock    int64  `json:"min_block"`
	MaxBlock    int64  `json:"max_block"`
	DataVersion int64  `json:"data_version"`
	Rows        uint64 `json:"rows"`
	ObjectKey   string `json:"object_key"`
	Bytes       uint64 `json:"bytes"`
	ETag        string `json:"etag"`
}

// Index lists a table's active objects as of one commit. External readers take the index
// with the highest key, since superseded objects stay in the bucket.
type Index struct {
	Table    string        `json:"table"`
	Epoch    int64         `json:"epoch"`
	Sequence int64         `json:"sequence"`
	Objects  []IndexObject `json:"objects"`
}

type IndexObject struct {
	Key   string `json:"key"`
	Rows  uint64 `json:"rows"`
	Bytes uint64 `json:"bytes"`
	ETag  string `json:"etag"`
}

// Dir holds the attempt's objects and nothing else.
func (location ObjectLocation) Dir() string {
	return fmt.Sprintf("%s/%s/day=%s/shard=%d/partition=%s/attempt=%s", strings.TrimSuffix(location.Prefix, "/"), location.Table, location.Day.Format(time.DateOnly), location.Shard, location.PartitionID, location.AttemptID)
}

func (location ObjectLocation) ObjectKey(partName string) string {
	return location.Dir() + "/" + partName + ".parquet"
}

func (location ObjectLocation) ManifestKey() string {
	return fmt.Sprintf("%s/%s/manifests/attempt=%s.json", strings.TrimSuffix(location.Prefix, "/"), location.Table, location.AttemptID)
}

// IndexKey sorts by the lease epoch, then by the table's commit sequence, so the latest
// index has the highest key whatever the writers' clocks say.
func IndexKey(prefix string, table string, epoch int64, sequence int64) string {
	return fmt.Sprintf("%s/%s/index/%020d-%020d.json", strings.TrimSuffix(prefix, "/"), table, epoch, sequence)
}

// IndexSequence is the commit sequence an index object, by file name or key, was written at.
func IndexSequence(file string) (int64, bool) {
	name := strings.TrimSuffix(path.Base(file), ".json")
	_, sequence, ok := strings.Cut(name, "-")
	if !ok {
		return 0, false
	}
	value, err := strconv.ParseInt(sequence, 10, 64)
	if err != nil {
		return 0, false
	}
	return value, true
}

// Encode returns the manifest's JSON and its SHA-256, recorded at commit so a restore can
// tell an edited manifest.
func (manifest Manifest) Encode() ([]byte, string, error) {
	encoded, err := json.Marshal(manifest)
	if err != nil {
		return nil, "", errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "couldn't encode the manifest of attempt %s", manifest.AttemptID)
	}

	sum := sha256.Sum256(encoded)
	return encoded, hex.EncodeToString(sum[:]), nil
}
