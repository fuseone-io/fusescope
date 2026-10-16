package openfgaserver

import (
	"github.com/fuseone-io/fusescope/pkg/authz"
	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/sqlstore"
	"github.com/openfga/openfga/pkg/storage"
	"github.com/openfga/openfga/pkg/storage/sqlcommon"
	"github.com/openfga/openfga/pkg/storage/sqlite"
)

func NewSQLStore(store sqlstore.SQLStore, config authz.Config) (storage.OpenFGADatastore, error) {
	switch store.BunDB().Dialect().Name().String() {
	case "sqlite":
		return sqlite.NewWithDB(store.SQLDB(), &sqlcommon.Config{
			MaxTuplesPerWriteField: config.OpenFGA.MaxTuplesPerWrite,
			MaxTypesPerModelField:  100,
		})

	}
	return nil, errors.Newf(errors.TypeInvalidInput, errors.CodeInvalidInput, "invalid store type: %s", store.BunDB().Dialect().Name().String())
}
