package openfgaserver

import (
	"github.com/fuseone-io/fusescope/pkg/authz"
	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/sqlstore"
	"github.com/fuseone-io/fusescope/pkg/sqlstore/postgressqlstore"
	"github.com/openfga/openfga/pkg/logger"
	"github.com/openfga/openfga/pkg/storage"
	"github.com/openfga/openfga/pkg/storage/postgres"
	"github.com/openfga/openfga/pkg/storage/sqlcommon"
	"github.com/openfga/openfga/pkg/storage/sqlite"
)

func NewSQLStore(store sqlstore.SQLStore, config authz.Config) (storage.OpenFGADatastore, error) {
	sqlConfig := &sqlcommon.Config{
		MaxTuplesPerWriteField: config.OpenFGA.MaxTuplesPerWrite,
		MaxTypesPerModelField:  100,
	}

	switch store.BunDB().Dialect().Name().String() {
	case "sqlite":
		return sqlite.NewWithDB(store.SQLDB(), sqlConfig)
	case "pg":
		pooler, ok := store.(postgressqlstore.PgxPooler)
		if !ok {
			return nil, errors.Newf(errors.TypeInvalidInput, errors.CodeInvalidInput, "postgres store does not expose a pgx pool")
		}

		sqlConfig.Logger = logger.NewNoopLogger()
		return postgres.NewWithDB(pooler.PgxPool(), nil, sqlConfig)
	}

	return nil, errors.Newf(errors.TypeInvalidInput, errors.CodeInvalidInput, "invalid store type: %s", store.BunDB().Dialect().Name().String())
}
