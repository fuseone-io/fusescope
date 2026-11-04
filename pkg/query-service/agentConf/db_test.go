package agentConf

import (
	"context"
	"path/filepath"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/fuseone-io/fusescope/pkg/factory/factorytest"
	"github.com/fuseone-io/fusescope/pkg/sqlstore"
	"github.com/fuseone-io/fusescope/pkg/sqlstore/postgressqlstore/postgressqlstoretest"
	"github.com/fuseone-io/fusescope/pkg/sqlstore/sqlitesqlstore"
	"github.com/fuseone-io/fusescope/pkg/types/opamptypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
)

func newVersionStore(t *testing.T, provider string) sqlstore.SQLStore {
	t.Helper()
	ctx := context.Background()
	var store sqlstore.SQLStore
	if provider == "postgres" {
		store = postgressqlstoretest.New(t)
	} else {
		var err error
		store, err = sqlitesqlstore.New(ctx, factorytest.NewSettings(), sqlstore.Config{
			Provider:   "sqlite",
			Connection: sqlstore.ConnectionConfig{MaxOpenConns: 1},
			Sqlite:     sqlstore.SqliteConfig{Path: filepath.Join(t.TempDir(), "agentconf.db"), Mode: "wal", BusyTimeout: 5 * time.Second, TransactionMode: "deferred"},
		})
		require.NoError(t, err)
	}
	_, err := store.BunDB().ExecContext(ctx, `CREATE TABLE users (id TEXT PRIMARY KEY, display_name TEXT)`)
	require.NoError(t, err)
	_, err = store.BunDB().NewCreateTable().Model((*opamptypes.AgentConfigVersion)(nil)).Exec(ctx)
	require.NoError(t, err)
	return store
}

// #261: the latest version was the maximum across every org, so an org
// whose own latest version was lower than another org's found none.
func TestGetLatestVersionIsPerOrg(t *testing.T) {
	for _, provider := range []string{"sqlite", "postgres"} {
		t.Run(provider, func(t *testing.T) {
			ctx := context.Background()
			repo := Repo{store: newVersionStore(t, provider)}
			orgA, orgB := valuer.GenerateUUID(), valuer.GenerateUUID()
			for org, latest := range map[valuer.UUID]int{orgA: 2, orgB: 5} {
				for version := 1; version <= latest; version++ {
					row := opamptypes.NewAgentConfigVersion(org, valuer.GenerateUUID(), opamptypes.ElementTypeLogPipelines)
					row.Version = version
					_, err := repo.store.BunDB().NewInsert().Model(row).Exec(ctx)
					require.NoError(t, err)
				}
			}

			for org, want := range map[valuer.UUID]int{orgA: 2, orgB: 5} {
				got, err := repo.GetLatestVersion(ctx, org, opamptypes.ElementTypeLogPipelines)
				require.NoError(t, err)
				require.Equal(t, want, got.Version)
			}
		})
	}
}
