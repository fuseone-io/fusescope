package archivetypes

import (
	"fmt"
	"slices"
	"strings"

	"github.com/fuseone-io/fusescope/pkg/clickhousesql"
	"github.com/fuseone-io/fusescope/pkg/errors"
)

const (
	RehydratedTablePrefix = "rehydrated_"

	RehydrationIDColumn = "rehydration_id"
	ExpiresAtColumn     = "expires_at"

	DDLCreate = "create"
	DDLAlter  = "alter"
	DDLDrop   = "drop"
)

var ErrCodeNotRehydratedTable = errors.MustNewCode("archive_not_rehydrated_table")

// TableSchema is a live table as system.tables and system.columns describe it.
type TableSchema struct {
	Database   string
	Name       string
	Engine     string
	EngineFull string
	SortingKey string
	PrimaryKey string
	Columns    []SchemaColumn
}

type SchemaColumn struct {
	Name              string
	Type              string
	DefaultKind       string
	DefaultExpression string
	Codec             string
	Comment           string
}

// RehydrationDDL is one statement on a rehydrated_* table. Clause follows the table name
// and ON CLUSTER: the body of a CREATE, or the commands of an ALTER.
type RehydrationDDL struct {
	Kind     string
	Database string
	Table    string
	Clause   string
}

func RehydratedTableName(live string) string {
	return RehydratedTablePrefix + live
}

// NewRehydratedTableDDL derives the CREATE of rehydrated_<live> from an allowlist of the
// live table's clauses: its columns with defaults and codecs, engine, sorting and primary
// keys, and settings. Partitioning becomes the restoration and TTL its expiry; skip
// indexes, projections and the live TTL are left out. A replicated engine gets a Keeper
// path of its own.
func NewRehydratedTableDDL(live TableSchema) (RehydrationDDL, error) {
	table := RehydratedTableName(live.Name)
	engine, err := rehydratedEngine(live, table)
	if err != nil {
		return RehydrationDDL{}, err
	}

	columns := make([]string, 0, len(live.Columns)+2)
	for _, column := range live.Columns {
		if column.Name == RehydrationIDColumn || column.Name == ExpiresAtColumn {
			return RehydrationDDL{}, errors.Newf(errors.TypeUnsupported, ErrCodeUnsupportedColumn, "column %s of %s clashes with the restoration's own", column.Name, live.Name)
		}
		columns = append(columns, column.Definition())
	}
	columns = append(columns, clickhousesql.Identifier(RehydrationIDColumn)+" UUID", clickhousesql.Identifier(ExpiresAtColumn)+" DateTime")

	clause := fmt.Sprintf("(\n    %s\n)\nENGINE = %s\nPARTITION BY %s", strings.Join(columns, ",\n    "), engine, clickhousesql.Identifier(RehydrationIDColumn))
	if live.PrimaryKey != "" && live.PrimaryKey != live.SortingKey {
		clause += "\nPRIMARY KEY (" + live.PrimaryKey + ")"
	}
	sortingKey := live.SortingKey
	if sortingKey == "" {
		sortingKey = "tuple()"
	}
	clause += "\nORDER BY (" + sortingKey + ")\nTTL " + clickhousesql.Identifier(ExpiresAtColumn)
	if settings := settingsOf(live.EngineFull); settings != "" {
		clause += "\nSETTINGS " + settings
	}

	return RehydrationDDL{Kind: DDLCreate, Database: live.Database, Table: table, Clause: clause}, nil
}

// NewRehydratedDistributedDDL derives rehydrated_<distributed> from a live Distributed
// table, pointing it at the rehydrated table of the one it reads, with the same sharding.
func NewRehydratedDistributedDDL(distributed TableSchema) (RehydrationDDL, error) {
	name, args, err := engineOf(distributed.EngineFull)
	if err != nil || name != "Distributed" || len(args) < 3 {
		return RehydrationDDL{}, errors.Newf(errors.TypeUnsupported, ErrCodeUnsupportedColumn, "%s is not a Distributed table: %s", distributed.Name, distributed.EngineFull)
	}

	local := RehydratedTableName(strings.Trim(args[2], "'`"))
	args[2] = clickhousesql.StringLiteral(local)
	clause := fmt.Sprintf("AS %s.%s\nENGINE = Distributed(%s)", clickhousesql.Identifier(distributed.Database), clickhousesql.Identifier(local), strings.Join(args, ", "))

	return RehydrationDDL{Kind: DDLCreate, Database: distributed.Database, Table: RehydratedTableName(distributed.Name), Clause: clause}, nil
}

// NewAddColumnsDDL adds to a rehydrated table the columns the live table gained since it
// was created, or returns false when there are none.
func NewAddColumnsDDL(live TableSchema, rehydrated TableSchema) (RehydrationDDL, bool) {
	var commands []string
	for _, column := range live.Columns {
		if !slices.ContainsFunc(rehydrated.Columns, func(existing SchemaColumn) bool { return existing.Name == column.Name }) {
			commands = append(commands, "ADD COLUMN IF NOT EXISTS "+column.Definition())
		}
	}
	if len(commands) == 0 {
		return RehydrationDDL{}, false
	}

	return RehydrationDDL{Kind: DDLAlter, Database: rehydrated.Database, Table: rehydrated.Name, Clause: strings.Join(commands, ", ")}, true
}

func NewDropRehydrationDDL(database string, table string, rehydrationID string) RehydrationDDL {
	return RehydrationDDL{Kind: DDLAlter, Database: database, Table: table, Clause: "DROP PARTITION " + clickhousesql.StringLiteral(rehydrationID)}
}

// Statement renders the DDL, refusing any table outside rehydrated_*: it is the only way
// restoration DDL reaches ClickHouse.
func (ddl RehydrationDDL) Statement(cluster string) (string, error) {
	if !strings.HasPrefix(ddl.Table, RehydratedTablePrefix) || len(ddl.Table) == len(RehydratedTablePrefix) {
		return "", errors.Newf(errors.TypeForbidden, ErrCodeNotRehydratedTable, "restoration DDL may only change rehydrated_* tables, not %q", ddl.Table)
	}

	table := clickhousesql.Identifier(ddl.Database) + "." + clickhousesql.Identifier(ddl.Table)
	onCluster := "ON CLUSTER " + clickhousesql.Identifier(cluster)
	switch ddl.Kind {
	case DDLCreate:
		return fmt.Sprintf("CREATE TABLE IF NOT EXISTS %s %s %s", table, onCluster, ddl.Clause), nil
	case DDLAlter:
		return fmt.Sprintf("ALTER TABLE %s %s %s", table, onCluster, ddl.Clause), nil
	case DDLDrop:
		return fmt.Sprintf("DROP TABLE IF EXISTS %s %s SYNC", table, onCluster), nil
	}
	return "", errors.Newf(errors.TypeInternal, errors.CodeInternal, "unknown restoration DDL kind %q", ddl.Kind)
}

func (column SchemaColumn) Definition() string {
	definition := clickhousesql.Identifier(column.Name) + " " + column.Type
	if column.DefaultKind != "" {
		definition += " " + column.DefaultKind + " " + column.DefaultExpression
	}
	if column.Codec != "" {
		definition += " " + column.Codec
	}
	if column.Comment != "" {
		definition += " COMMENT " + clickhousesql.StringLiteral(column.Comment)
	}
	return definition
}

// Insertable reports whether an INSERT can write the column.
func (column SchemaColumn) Insertable() bool {
	return column.DefaultKind != "MATERIALIZED" && column.DefaultKind != "ALIAS" && column.DefaultKind != "EPHEMERAL"
}

func rehydratedEngine(live TableSchema, table string) (string, error) {
	name, args, err := engineOf(live.EngineFull)
	if err != nil || name != live.Engine || !strings.HasSuffix(name, "MergeTree") {
		return "", errors.Newf(errors.TypeUnsupported, ErrCodeUnsupportedColumn, "%s has engine %s, only the MergeTree family can be restored", live.Name, live.Engine)
	}

	if strings.HasPrefix(name, "Replicated") {
		if len(args) >= 2 && strings.HasPrefix(args[0], "'") {
			args = args[2:]
		}
		path := clickhousesql.StringLiteral(fmt.Sprintf("/clickhouse/tables/{shard}/%s.%s", live.Database, table))
		args = append([]string{path, clickhousesql.StringLiteral("{replica}")}, args...)
	}
	if len(args) == 0 {
		return name, nil
	}
	return fmt.Sprintf("%s(%s)", name, strings.Join(args, ", ")), nil
}

// engineOf splits the engine call at the start of engine_full into its name and arguments.
func engineOf(engineFull string) (string, []string, error) {
	end := strings.IndexAny(engineFull, " (")
	if end < 0 {
		return engineFull, nil, nil
	}
	if engineFull[end] == ' ' {
		return engineFull[:end], nil, nil
	}

	depth := 0
	var quote byte
	for i := end; i < len(engineFull); i++ {
		c := engineFull[i]
		switch {
		case quote != 0:
			switch c {
			case '\\':
				i++
			case quote:
				quote = 0
			}
		case c == '\'' || c == '`':
			quote = c
		case c == '(':
			depth++
		case c == ')':
			depth--
			if depth == 0 {
				return parseType(engineFull[:i+1])
			}
		}
	}
	return "", nil, unsupportedType(engineFull)
}

func settingsOf(engineFull string) string {
	index := strings.LastIndex(engineFull, " SETTINGS ")
	if index < 0 {
		return ""
	}
	return engineFull[index+len(" SETTINGS "):]
}
