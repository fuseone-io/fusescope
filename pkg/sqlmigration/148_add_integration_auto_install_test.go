package sqlmigration

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestAddIntegrationAutoInstall(t *testing.T) {
	for name, open := range migrationStores() {
		t.Run(name, func(t *testing.T) {
			ctx := context.Background()
			s := open(t)
			db := s.store.BunDB()
			migration := &addIntegrationAutoInstall{sqlschema: s.schema}
			require.NoError(t, migration.Up(ctx, db))
			require.NoError(t, migration.Up(ctx, db), "the migration is idempotent")

			insert := `INSERT INTO integration_auto_install (org_id, integration, state, updated_at) VALUES (?, ?, 'pending', current_timestamp)`
			_, err := db.ExecContext(ctx, insert, "org1", "builtin-fusescope_collector")
			require.NoError(t, err)
			_, err = db.ExecContext(ctx, insert, "org1", "builtin-fusescope_collector")
			assert.Error(t, err, "one record per integration of an organization")
			_, err = db.ExecContext(ctx, insert, "org2", "builtin-fusescope_collector")
			assert.NoError(t, err)

			var attempts int64
			var lastError, version string
			require.NoError(t, db.NewRaw(`SELECT attempts, last_error, version FROM integration_auto_install WHERE org_id = 'org1'`).Scan(ctx, &attempts, &lastError, &version))
			assert.Zero(t, attempts)
			assert.Empty(t, lastError)
			assert.Empty(t, version)
		})
	}
}
