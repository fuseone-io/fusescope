package archivetypes

import (
	"time"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/types"
	"github.com/fuseone-io/fusescope/pkg/valuer"
	"github.com/uptrace/bun"
)

var ErrCodeShardMismatch = errors.MustNewCode("archive_shard_mismatch")

// Shard pins a table's shard number, a position in remote_servers, to the replica path of
// its data. Block numbers are per shard, so ranges only compare within one.
type Shard struct {
	bun.BaseModel `bun:"table:archive_shard,alias:archive_shard"`

	types.Identifiable
	types.TimeAuditable
	TableName   string `bun:"table_name"`
	Shard       int    `bun:"shard"`
	ReplicaPath string `bun:"replica_path"`
}

func NewShard(table string, shard int, replicaPath string) *Shard {
	now := time.Now()
	return &Shard{
		Identifiable:  types.Identifiable{ID: valuer.GenerateUUID()},
		TimeAuditable: types.TimeAuditable{CreatedAt: now, UpdatedAt: now},
		TableName:     table,
		Shard:         shard,
		ReplicaPath:   replicaPath,
	}
}
