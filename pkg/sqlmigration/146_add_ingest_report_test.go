package sqlmigration

import (
	"context"
	"path/filepath"
	"testing"
	"time"

	"github.com/fuseone-io/fusescope/pkg/factory/factorytest"
	"github.com/fuseone-io/fusescope/pkg/sqlschema"
	"github.com/fuseone-io/fusescope/pkg/sqlschema/sqlitesqlschema"
	"github.com/fuseone-io/fusescope/pkg/sqlstore"
	"github.com/fuseone-io/fusescope/pkg/sqlstore/sqlitesqlstore"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestAddIngestReport(t *testing.T) {
	ctx := context.Background()
	store, err := sqlitesqlstore.New(ctx, factorytest.NewSettings(), sqlstore.Config{
		Provider:   "sqlite",
		Connection: sqlstore.ConnectionConfig{MaxOpenConns: 10},
		Sqlite: sqlstore.SqliteConfig{
			Path:            filepath.Join(t.TempDir(), "test.db"),
			Mode:            "wal",
			BusyTimeout:     5 * time.Second,
			TransactionMode: "deferred",
		},
	})
	require.NoError(t, err)
	schema, err := sqlitesqlschema.New(ctx, factorytest.NewSettings(), sqlschema.Config{}, store)
	require.NoError(t, err)

	migration := &addIngestReport{sqlschema: schema}
	require.NoError(t, migration.Up(ctx, store.BunDB()))
	require.NoError(t, migration.Up(ctx, store.BunDB()), "the migration is idempotent")

	db := store.BunDB()
	_, err = db.ExecContext(ctx, `INSERT INTO ingest_report_agent (agent_id, created_at, updated_at) VALUES ('a', current_timestamp, current_timestamp)`)
	require.NoError(t, err)
	var applied, invalidated int64
	require.NoError(t, db.NewRaw(`SELECT applied, invalidated FROM ingest_report_agent`).Scan(ctx, &applied, &invalidated))
	assert.Zero(t, applied, "a new agent has applied nothing")
	assert.Zero(t, invalidated)
	_, err = db.ExecContext(ctx, `INSERT INTO ingest_report_agent (agent_id, created_at, updated_at) VALUES ('a', current_timestamp, current_timestamp)`)
	assert.Error(t, err, "one record per agent")

	insert := `INSERT INTO ingest_report_application (application_id, agent_id, reported_at) VALUES (?, ?, current_timestamp)`
	_, err = db.ExecContext(ctx, insert, "app", "a")
	require.NoError(t, err)
	_, err = db.ExecContext(ctx, insert, "app", "b")
	require.NoError(t, err, "one row per application and agent")
	_, err = db.ExecContext(ctx, insert, "app", "a")
	assert.Error(t, err)
	var rejections string
	require.NoError(t, db.NewRaw(`SELECT rejections FROM ingest_report_application WHERE agent_id = 'a'`).Scan(ctx, &rejections))
	assert.Equal(t, "[]", rejections)

	var indexes []string
	require.NoError(t, db.NewRaw(`SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_ingest_report_%' ORDER BY name`).Scan(ctx, &indexes))
	assert.Equal(t, []string{
		"idx_ingest_report_agent_created_at",
		"idx_ingest_report_agent_updated_at",
		"idx_ingest_report_application_agent_id",
		"idx_ingest_report_application_reported_at",
	}, indexes, "pruning and counting new agents read by index")
}
