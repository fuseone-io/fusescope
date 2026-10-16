package main

import (
	"github.com/fuseone-io/fusescope/pkg/factory"
	"github.com/fuseone-io/fusescope/pkg/signoz"
	"github.com/fuseone-io/fusescope/pkg/sqlschema"
	"github.com/fuseone-io/fusescope/pkg/sqlstore"
)

func sqlstoreProviderFactories() factory.NamedMap[factory.ProviderFactory[sqlstore.SQLStore, sqlstore.Config]] {
	return signoz.NewSQLStoreProviderFactories()
}

func sqlschemaProviderFactories(sqlstore sqlstore.SQLStore) factory.NamedMap[factory.ProviderFactory[sqlschema.SQLSchema, sqlschema.Config]] {
	return signoz.NewSQLSchemaProviderFactories(sqlstore)
}
