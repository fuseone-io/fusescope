package sqlmigration

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestAddWatchdog(t *testing.T) {
	for name, open := range migrationStores() {
		t.Run(name, func(t *testing.T) {
			ctx := context.Background()
			s := open(t)
			db := s.store.BunDB()
			_, err := db.ExecContext(ctx, `CREATE TABLE organizations (id TEXT PRIMARY KEY)`)
			require.NoError(t, err)
			_, err = db.ExecContext(ctx, `INSERT INTO organizations (id) VALUES ('org1'), ('org2')`)
			require.NoError(t, err)

			migration := &addWatchdog{sqlschema: s.schema}
			require.NoError(t, migration.Up(ctx, db))
			require.NoError(t, migration.Up(ctx, db), "the migration is idempotent")

			issue := `INSERT INTO watchdog_issue (id, org_id, detector, service, fingerprint, status, severity,
					first_seen, last_seen, evidence, created_at, updated_at)
				VALUES (?, ?, 'error_rate', 'checkout', ?, ?, 'warning',
					current_timestamp, current_timestamp, '{"version":1}', current_timestamp, current_timestamp)`
			_, err = db.ExecContext(ctx, issue, "i1", "org1", "fp", "open")
			require.NoError(t, err)
			for _, status := range []string{"open", "acknowledged", "muted"} {
				_, err = db.ExecContext(ctx, issue, "x-"+status, "org1", "fp", status)
				assert.Error(t, err, "one %s issue per active fingerprint", status)
			}
			_, err = db.ExecContext(ctx, issue, "i2", "org1", "fp", "resolved")
			assert.NoError(t, err, "resolved issues keep the fingerprint")
			_, err = db.ExecContext(ctx, issue, "i3", "org1", "fp", "resolved")
			assert.NoError(t, err)
			_, err = db.ExecContext(ctx, issue, "i4", "org2", "fp", "open")
			assert.NoError(t, err, "fingerprints are per organization")
			_, err = db.ExecContext(ctx, issue, "i5", "nope", "other", "open")
			assert.Error(t, err, "issues belong to an organization")

			var cleans int
			require.NoError(t, db.NewRaw(`SELECT clean_evaluations FROM watchdog_issue WHERE id = 'i1'`).Scan(ctx, &cleans))
			assert.Zero(t, cleans)

			setting := `INSERT INTO watchdog_setting (id, org_id, detector, created_at, updated_at)
				VALUES (?, ?, ?, current_timestamp, current_timestamp)`
			_, err = db.ExecContext(ctx, setting, "s1", "org1", "error_rate")
			require.NoError(t, err)
			_, err = db.ExecContext(ctx, setting, "s2", "org1", "error_rate")
			assert.Error(t, err, "one setting per detector of an organization")
			_, err = db.ExecContext(ctx, setting, "s3", "org2", "error_rate")
			assert.NoError(t, err)

			var defaults struct {
				Enabled bool `bun:"enabled"`
				Notify  bool `bun:"notify"`
			}
			require.NoError(t, db.NewRaw(`SELECT enabled, notify FROM watchdog_setting WHERE id = 's1'`).Scan(ctx, &defaults))
			assert.True(t, defaults.Enabled)
			assert.False(t, defaults.Notify)
		})
	}
}
