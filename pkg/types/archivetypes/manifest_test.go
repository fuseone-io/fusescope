package archivetypes

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestKeys(t *testing.T) {
	location := ObjectLocation{Prefix: "fusescope/", Table: "logs_v2", Day: time.Date(2026, 9, 3, 0, 0, 0, 0, time.UTC), Shard: 2, PartitionID: "20260903-15-0", AttemptID: "0199d3c1"}

	assert.Equal(t, "fusescope/logs_v2/day=2026-09-03/shard=2/partition=20260903-15-0/attempt=0199d3c1/20260903-15-0_1_5_1.parquet", location.ObjectKey("20260903-15-0_1_5_1"))
	assert.Equal(t, "fusescope/logs_v2/manifests/attempt=0199d3c1.json", location.ManifestKey())
	assert.Equal(t, "fusescope/logs_v2/index/0199d3c9.json", IndexKey("fusescope", "logs_v2", "0199d3c9"))
}

func TestManifestEncode(t *testing.T) {
	manifest := Manifest{
		FormatVersion:   FormatVersion,
		MigratorVersion: "v0.145.0",
		Table:           "logs_v2",
		Shard:           1,
		PartitionID:     "20260903-15-0",
		Day:             "2026-09-03",
		AttemptID:       "0199d3c1",
		Columns:         []ColumnMapping{{Name: "timestamp", SourceType: "UInt64", ExportType: "Int64"}},
		Parts:           []ManifestPart{{Name: "20260903-15-0_1_5_1", MinBlock: 1, MaxBlock: 5, DataVersion: 1, Rows: 10, ObjectKey: "k", Bytes: 2048, ETag: "e"}},
	}

	encoded, digest, err := manifest.Encode()
	require.NoError(t, err)

	sum := sha256.Sum256(encoded)
	assert.Equal(t, hex.EncodeToString(sum[:]), digest)

	var decoded Manifest
	require.NoError(t, json.Unmarshal(encoded, &decoded))
	assert.Equal(t, manifest, decoded)
	assert.JSONEq(t, `{
		"format_version": 1,
		"migrator_version": "v0.145.0",
		"table": "logs_v2",
		"shard": 1,
		"partition_id": "20260903-15-0",
		"day": "2026-09-03",
		"attempt_id": "0199d3c1",
		"columns": [{"name": "timestamp", "source_type": "UInt64", "export_type": "Int64"}],
		"parts": [{"name": "20260903-15-0_1_5_1", "min_block": 1, "max_block": 5, "data_version": 1, "rows": 10, "object_key": "k", "bytes": 2048, "etag": "e"}]
	}`, string(encoded))
}
