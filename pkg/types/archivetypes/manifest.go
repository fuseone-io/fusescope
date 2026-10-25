package archivetypes

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/fuseone-io/fusescope/pkg/errors"
)

// ObjectLocation is where one attempt writes its objects and manifest. Table has no
// database; Day is the partition's min_date.
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
	CommitID string        `json:"commit_id"`
	Objects  []IndexObject `json:"objects"`
}

type IndexObject struct {
	Key   string `json:"key"`
	Rows  uint64 `json:"rows"`
	Bytes uint64 `json:"bytes"`
	ETag  string `json:"etag"`
}

func (location ObjectLocation) ObjectKey(partName string) string {
	return fmt.Sprintf("%s/%s/day=%s/shard=%d/partition=%s/attempt=%s/%s.parquet", strings.TrimSuffix(location.Prefix, "/"), location.Table, location.Day.Format(time.DateOnly), location.Shard, location.PartitionID, location.AttemptID, partName)
}

func (location ObjectLocation) ManifestKey() string {
	return fmt.Sprintf("%s/%s/manifests/attempt=%s.json", strings.TrimSuffix(location.Prefix, "/"), location.Table, location.AttemptID)
}

// IndexKey sorts by commitID, a UUIDv7, so the latest index has the highest key.
func IndexKey(prefix string, table string, commitID string) string {
	return fmt.Sprintf("%s/%s/index/%s.json", strings.TrimSuffix(prefix, "/"), table, commitID)
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
