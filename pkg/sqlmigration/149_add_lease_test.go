package sqlmigration

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestAddLease(t *testing.T) {
	for name, open := range migrationStores() {
		t.Run(name, func(t *testing.T) {
			ctx := context.Background()
			s := open(t)
			db := s.store.BunDB()
			migration := &addLease{sqlschema: s.schema}
			require.NoError(t, migration.Up(ctx, db))
			require.NoError(t, migration.Up(ctx, db), "the migration is idempotent")

			insert := `INSERT INTO lease (name, holder, expires_at, created_at, updated_at) VALUES (?, 'a', current_timestamp, current_timestamp, current_timestamp)`
			_, err := db.ExecContext(ctx, insert, "watchdog/scheduler")
			require.NoError(t, err)
			_, err = db.ExecContext(ctx, insert, "watchdog/scheduler")
			assert.Error(t, err, "one row per lease name")

			var epoch int64
			require.NoError(t, db.NewRaw(`SELECT epoch FROM lease WHERE name = 'watchdog/scheduler'`).Scan(ctx, &epoch))
			assert.Zero(t, epoch)
		})
	}
}
