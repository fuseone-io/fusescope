package postgressqlstore

import (
	"context"
	"reflect"
	"slices"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/uptrace/bun"
)

const (
	Identity string = "id"
	Text     string = "TEXT"
)

const (
	Org                string = "org"
	User               string = "user"
	UserNoCascade      string = "user_no_cascade"
	FactorPassword     string = "factor_password"
	CloudIntegration   string = "cloud_integration"
	AgentConfigVersion string = "agent_config_version"
)

const (
	OrgReference                string = `("org_id") REFERENCES "organizations" ("id")`
	UserReference               string = `("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE`
	UserNoCascadeReference      string = `("user_id") REFERENCES "users" ("id")`
	FactorPasswordReference     string = `("password_id") REFERENCES "factor_password" ("id")`
	CloudIntegrationReference   string = `("cloud_integration_id") REFERENCES "cloud_integration" ("id") ON DELETE CASCADE`
	AgentConfigVersionReference string = `("version_id") REFERENCES "agent_config_version" ("id")`
)

var integerColumnTypes = []string{"SMALLINT", "INTEGER", "BIGINT"}

type dialect struct{}

// GetColumnType returns the information_schema data type in upper case, e.g. TEXT, BIGINT or TIMESTAMP WITHOUT TIME ZONE.
func (dialect *dialect) GetColumnType(ctx context.Context, bun bun.IDB, table string, column string) (string, error) {
	var columnType string

	err := bun.
		NewSelect().
		ColumnExpr("upper(data_type)").
		TableExpr("information_schema.columns").
		Where("table_schema = current_schema()").
		Where("table_name = ?", table).
		Where("column_name = ?", column).
		Scan(ctx, &columnType)
	if err != nil {
		return "", err
	}

	return columnType, nil
}

func (dialect *dialect) IntToTimestamp(ctx context.Context, bun bun.IDB, table string, column string) error {
	columnType, err := dialect.GetColumnType(ctx, bun, table, column)
	if err != nil {
		return err
	}

	if !slices.Contains(integerColumnTypes, columnType) {
		return nil
	}

	if _, err := bun.ExecContext(ctx, "ALTER TABLE ? ALTER COLUMN ? DROP DEFAULT", bunIdent(table), bunIdent(column)); err != nil {
		return err
	}

	_, err = bun.ExecContext(ctx, "ALTER TABLE ? ALTER COLUMN ? TYPE TIMESTAMP USING to_timestamp(?) AT TIME ZONE 'UTC'", bunIdent(table), bunIdent(column), bunIdent(column))
	return err
}

func (dialect *dialect) IntToBoolean(ctx context.Context, bun bun.IDB, table string, column string) error {
	columnExists, err := dialect.ColumnExists(ctx, bun, table, column)
	if err != nil {
		return err
	}
	if !columnExists {
		return nil
	}

	columnType, err := dialect.GetColumnType(ctx, bun, table, column)
	if err != nil {
		return err
	}

	if !slices.Contains(integerColumnTypes, columnType) {
		return nil
	}

	if _, err := bun.ExecContext(ctx, "ALTER TABLE ? ALTER COLUMN ? DROP DEFAULT", bunIdent(table), bunIdent(column)); err != nil {
		return err
	}

	_, err = bun.ExecContext(ctx, "ALTER TABLE ? ALTER COLUMN ? TYPE BOOLEAN USING CASE WHEN ? = 1 THEN true ELSE false END", bunIdent(table), bunIdent(column), bunIdent(column))
	return err
}

func (dialect *dialect) ColumnExists(ctx context.Context, bun bun.IDB, table string, column string) (bool, error) {
	var count int
	err := bun.
		NewSelect().
		ColumnExpr("COUNT(*)").
		TableExpr("information_schema.columns").
		Where("table_schema = current_schema()").
		Where("table_name = ?", table).
		Where("column_name = ?", column).
		Scan(ctx, &count)
	if err != nil {
		return false, err
	}

	return count > 0, nil
}

func (dialect *dialect) AddColumn(ctx context.Context, bun bun.IDB, table string, column string, columnExpr string) error {
	_, err := bun.ExecContext(ctx, "ALTER TABLE ? ADD COLUMN IF NOT EXISTS ? "+columnExpr, bunIdent(table), bunIdent(column))
	return err
}

func (dialect *dialect) RenameColumn(ctx context.Context, bun bun.IDB, table string, oldColumnName string, newColumnName string) (bool, error) {
	oldColumnExists, err := dialect.ColumnExists(ctx, bun, table, oldColumnName)
	if err != nil {
		return false, err
	}

	newColumnExists, err := dialect.ColumnExists(ctx, bun, table, newColumnName)
	if err != nil {
		return false, err
	}

	if newColumnExists {
		return true, nil
	}

	if !oldColumnExists {
		return false, errors.Newf(errors.TypeInvalidInput, errors.CodeInvalidInput, "old column: %s doesn't exist", oldColumnName)
	}

	if _, err := bun.ExecContext(ctx, "ALTER TABLE ? RENAME COLUMN ? TO ?", bunIdent(table), bunIdent(oldColumnName), bunIdent(newColumnName)); err != nil {
		return false, err
	}

	return true, nil
}

func (dialect *dialect) DropColumn(ctx context.Context, bun bun.IDB, table string, column string) error {
	_, err := bun.ExecContext(ctx, "ALTER TABLE ? DROP COLUMN IF EXISTS ?", bunIdent(table), bunIdent(column))
	return err
}

func (dialect *dialect) TableExists(ctx context.Context, bun bun.IDB, table interface{}) (bool, error) {
	var count int
	err := bun.
		NewSelect().
		ColumnExpr("COUNT(*)").
		TableExpr("information_schema.tables").
		Where("table_schema = current_schema()").
		Where("table_name = ?", bun.Dialect().Tables().Get(reflect.TypeOf(table)).Name).
		Scan(ctx, &count)
	if err != nil {
		return false, err
	}

	return count > 0, nil
}

func (dialect *dialect) RenameTableAndModifyModel(ctx context.Context, bun bun.IDB, oldModel interface{}, newModel interface{}, references []string, cb func(context.Context) error) error {
	if len(references) == 0 {
		return errors.Newf(errors.TypeInvalidInput, errors.CodeInvalidInput, "cannot run migration without reference")
	}

	exists, err := dialect.TableExists(ctx, bun, newModel)
	if err != nil {
		return err
	}
	if exists {
		return nil
	}

	var fkReferences []string
	for _, reference := range references {
		fkReference, ok := foreignKeyReference(reference)
		if ok && !slices.Contains(fkReferences, fkReference) {
			fkReferences = append(fkReferences, fkReference)
		}
	}

	createTable := bun.
		NewCreateTable().
		IfNotExists().
		Model(newModel)

	for _, fk := range fkReferences {
		createTable = createTable.ForeignKey(fk)
	}

	if _, err := createTable.Exec(ctx); err != nil {
		return err
	}

	if err := cb(ctx); err != nil {
		return err
	}

	_, err = bun.
		NewDropTable().
		IfExists().
		Model(oldModel).
		Exec(ctx)
	return err
}

// AddNotNullDefaultToColumn backfills NULLs with the default before enforcing NOT NULL.
func (dialect *dialect) AddNotNullDefaultToColumn(ctx context.Context, bun bun.IDB, table string, column, columnType, defaultValue string) error {
	if _, err := bun.ExecContext(ctx, "ALTER TABLE ? ALTER COLUMN ? TYPE "+columnType+" USING ?::"+columnType, bunIdent(table), bunIdent(column), bunIdent(column)); err != nil {
		return err
	}

	if _, err := bun.ExecContext(ctx, "ALTER TABLE ? ALTER COLUMN ? SET DEFAULT "+defaultValue, bunIdent(table), bunIdent(column)); err != nil {
		return err
	}

	if _, err := bun.ExecContext(ctx, "UPDATE ? SET ? = "+defaultValue+" WHERE ? IS NULL", bunIdent(table), bunIdent(column), bunIdent(column)); err != nil {
		return err
	}

	_, err := bun.ExecContext(ctx, "ALTER TABLE ? ALTER COLUMN ? SET NOT NULL", bunIdent(table), bunIdent(column))
	return err
}

func (dialect *dialect) UpdatePrimaryKey(ctx context.Context, bun bun.IDB, oldModel interface{}, newModel interface{}, reference string, cb func(context.Context) error) error {
	if reference == "" {
		return errors.Newf(errors.TypeInvalidInput, errors.CodeInvalidInput, "cannot run migration without reference")
	}

	oldTableName := bun.Dialect().Tables().Get(reflect.TypeOf(oldModel)).Name

	columnType, err := dialect.GetColumnType(ctx, bun, oldTableName, Identity)
	if err != nil {
		return err
	}
	if columnType == Text {
		return nil
	}

	return dialect.replaceTable(ctx, bun, oldModel, newModel, reference, cb)
}

func (dialect *dialect) AddPrimaryKey(ctx context.Context, bun bun.IDB, oldModel interface{}, newModel interface{}, reference string, cb func(context.Context) error) error {
	if reference == "" {
		return errors.Newf(errors.TypeInvalidInput, errors.CodeInvalidInput, "cannot run migration without reference")
	}

	oldTableName := bun.Dialect().Tables().Get(reflect.TypeOf(oldModel)).Name

	identityExists, err := dialect.ColumnExists(ctx, bun, oldTableName, Identity)
	if err != nil {
		return err
	}
	if identityExists {
		return nil
	}

	return dialect.replaceTable(ctx, bun, oldModel, newModel, reference, cb)
}

// DropColumnWithForeignKeyConstraint relies on postgres dropping the constraints that depend on the column.
func (dialect *dialect) DropColumnWithForeignKeyConstraint(ctx context.Context, bunIDB bun.IDB, model interface{}, column string) error {
	table := bunIDB.Dialect().Tables().Get(reflect.TypeOf(model))
	return dialect.DropColumn(ctx, bunIDB, table.Name, column)
}

// ToggleForeignKeyConstraint is a no-op: postgres alters tables in place, so the
// sqlite-style table rebuilds that need foreign keys switched off never happen.
func (dialect *dialect) ToggleForeignKeyConstraint(_ context.Context, _ *bun.DB, _ bool) error {
	return nil
}

// replaceTable creates the new model's table, lets cb copy the rows, drops the old
// table and gives the new one the old name.
func (dialect *dialect) replaceTable(ctx context.Context, bun bun.IDB, oldModel interface{}, newModel interface{}, reference string, cb func(context.Context) error) error {
	oldTableName := bun.Dialect().Tables().Get(reflect.TypeOf(oldModel)).Name
	newTableName := bun.Dialect().Tables().Get(reflect.TypeOf(newModel)).Name

	createTable := bun.
		NewCreateTable().
		IfNotExists().
		Model(newModel)

	if fkReference, ok := foreignKeyReference(reference); ok && (reference == Org || reference == User) {
		createTable = createTable.ForeignKey(fkReference)
	}

	if _, err := createTable.Exec(ctx); err != nil {
		return err
	}

	if err := cb(ctx); err != nil {
		return err
	}

	if _, err := bun.NewDropTable().IfExists().Model(oldModel).Exec(ctx); err != nil {
		return err
	}

	_, err := bun.ExecContext(ctx, "ALTER TABLE ? RENAME TO ?", bunIdent(newTableName), bunIdent(oldTableName))
	return err
}

func foreignKeyReference(reference string) (string, bool) {
	switch reference {
	case Org:
		return OrgReference, true
	case User:
		return UserReference, true
	case UserNoCascade:
		return UserNoCascadeReference, true
	case FactorPassword:
		return FactorPasswordReference, true
	case CloudIntegration:
		return CloudIntegrationReference, true
	case AgentConfigVersion:
		return AgentConfigVersionReference, true
	}

	return "", false
}

func bunIdent(name string) bun.Ident {
	return bun.Ident(name)
}
