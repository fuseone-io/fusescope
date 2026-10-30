package archivetypes

import (
	"encoding/json"
	"flag"
	"os"
	"path/filepath"
	"testing"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

var updateGolden = flag.Bool("update", false, "rewrite the golden restoration DDL in testdata")

// TestRehydratedTableDDLGolden pins the DDL derived from every restorable live table, as
// system.tables and system.columns described them in the integration ClickHouse.
func TestRehydratedTableDDLGolden(t *testing.T) {
	testCases := []struct {
		name   string
		derive func(TableSchema) (RehydrationDDL, error)
	}{
		{name: "logs_v2", derive: NewRehydratedTableDDL},
		{name: "logs_v2_resource", derive: NewRehydratedTableDDL},
		{name: "distributed_logs_v2", derive: NewRehydratedDistributedDDL},
		{name: "distributed_logs_v2_resource", derive: NewRehydratedDistributedDDL},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			ddl, err := testCase.derive(readSchema(t, testCase.name))
			require.NoError(t, err)
			statement, err := ddl.Statement("cluster")
			require.NoError(t, err)

			golden := filepath.Join("testdata", "rehydrated_"+testCase.name+".sql")
			if *updateGolden {
				require.NoError(t, os.WriteFile(golden, []byte(statement+"\n"), 0o600))
			}
			expected, err := os.ReadFile(golden)
			require.NoError(t, err)
			assert.Equal(t, string(expected), statement+"\n")
		})
	}
}

func TestNewRehydratedTableDDL(t *testing.T) {
	base := func() TableSchema {
		return TableSchema{
			Database:   "db",
			Name:       "events",
			Engine:     "MergeTree",
			EngineFull: "MergeTree PARTITION BY toDate(ts) ORDER BY ts TTL toDateTime(ts) + toIntervalDay(1) SETTINGS index_granularity = 8192",
			SortingKey: "ts",
			PrimaryKey: "ts",
			Columns:    []SchemaColumn{{Name: "ts", Type: "DateTime"}},
		}
	}

	testCases := []struct {
		name     string
		mutate   func(*TableSchema)
		contains []string
		absent   []string
		errCode  errors.Code
	}{
		{
			name:     "MergeTree_KeepsSettingsAndOrder",
			mutate:   func(*TableSchema) {},
			contains: []string{"ENGINE = MergeTree\nPARTITION BY `rehydration_id`\nORDER BY (ts)\nTTL `expires_at`\nSETTINGS index_granularity = 8192", "`rehydration_id` UUID", "`expires_at` DateTime"},
			absent:   []string{"toIntervalDay", "toDate(ts)"},
		},
		{
			name: "ReplacingWithVersion_KeepsVersion",
			mutate: func(s *TableSchema) {
				s.Engine, s.EngineFull = "ReplacingMergeTree", "ReplacingMergeTree(ver) ORDER BY ts"
			},
			contains: []string{"ENGINE = ReplacingMergeTree(ver)\n"},
			absent:   []string{"SETTINGS"},
		},
		{
			name: "Replicated_OwnKeeperPath",
			mutate: func(s *TableSchema) {
				s.Engine, s.EngineFull = "ReplicatedReplacingMergeTree", "ReplicatedReplacingMergeTree('/clickhouse/tables/{uuid}/{shard}', '{replica}', ver) ORDER BY ts"
			},
			contains: []string{"ENGINE = ReplicatedReplacingMergeTree('/clickhouse/tables/{shard}/db.rehydrated_events', '{replica}', ver)\n"},
			absent:   []string{"{uuid}"},
		},
		{
			name:     "PrimaryKeyPrefix_Kept",
			mutate:   func(s *TableSchema) { s.SortingKey, s.PrimaryKey = "ts, id", "ts" },
			contains: []string{"PRIMARY KEY (ts)\nORDER BY (ts, id)"},
		},
		{
			name:     "NoSortingKey_Tuple",
			mutate:   func(s *TableSchema) { s.SortingKey, s.PrimaryKey = "", "" },
			contains: []string{"ORDER BY (tuple())"},
		},
		{
			name: "ColumnDefaultsAndCodecs_Kept",
			mutate: func(s *TableSchema) {
				s.Columns = append(s.Columns, SchemaColumn{Name: "day", Type: "Date", DefaultKind: "MATERIALIZED", DefaultExpression: "toDate(ts)", Codec: "CODEC(ZSTD(1))", Comment: "it's a day"})
			},
			contains: []string{"`day` Date MATERIALIZED toDate(ts) CODEC(ZSTD(1)) COMMENT 'it\\'s a day'"},
		},
		{
			name:    "Distributed_Refused",
			mutate:  func(s *TableSchema) { s.Engine, s.EngineFull = "Distributed", "Distributed('cluster', 'db', 'events')" },
			errCode: ErrCodeUnsupportedColumn,
		},
		{
			name: "RehydrationIDColumn_Refused",
			mutate: func(s *TableSchema) {
				s.Columns = append(s.Columns, SchemaColumn{Name: "rehydration_id", Type: "String"})
			},
			errCode: ErrCodeUnsupportedColumn,
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			schema := base()
			testCase.mutate(&schema)

			ddl, err := NewRehydratedTableDDL(schema)
			if testCase.errCode != (errors.Code{}) {
				assert.True(t, errors.Asc(err, testCase.errCode), err)
				return
			}
			require.NoError(t, err)
			assert.Equal(t, "rehydrated_events", ddl.Table)
			for _, s := range testCase.contains {
				assert.Contains(t, ddl.Clause, s)
			}
			for _, s := range testCase.absent {
				assert.NotContains(t, ddl.Clause, s)
			}
		})
	}
}

func TestRehydrationDDLStatement(t *testing.T) {
	testCases := []struct {
		name      string
		ddl       RehydrationDDL
		statement string
	}{
		{name: "Create", ddl: RehydrationDDL{Kind: DDLCreate, Database: "db", Table: "rehydrated_logs", Clause: "AS x"}, statement: "CREATE TABLE IF NOT EXISTS `db`.`rehydrated_logs` ON CLUSTER `cluster` AS x"},
		{name: "Alter", ddl: NewDropRehydrationDDL("db", "rehydrated_logs", "id'1"), statement: "ALTER TABLE `db`.`rehydrated_logs` ON CLUSTER `cluster` DROP PARTITION 'id\\'1'"},
		{name: "Drop", ddl: RehydrationDDL{Kind: DDLDrop, Database: "db", Table: "rehydrated_logs"}, statement: "DROP TABLE IF EXISTS `db`.`rehydrated_logs` ON CLUSTER `cluster` SYNC"},
		{name: "LiveTable_Refused", ddl: RehydrationDDL{Kind: DDLDrop, Database: "db", Table: "logs_v2"}},
		{name: "PrefixInside_Refused", ddl: RehydrationDDL{Kind: DDLCreate, Database: "db", Table: "logs_rehydrated_v2"}},
		{name: "PrefixOnly_Refused", ddl: RehydrationDDL{Kind: DDLDrop, Database: "db", Table: "rehydrated_"}},
		{name: "UnknownKind_Refused", ddl: RehydrationDDL{Kind: "truncate", Database: "db", Table: "rehydrated_logs"}},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			statement, err := testCase.ddl.Statement("cluster")
			if testCase.statement == "" {
				assert.Error(t, err)
				return
			}
			require.NoError(t, err)
			assert.Equal(t, testCase.statement, statement)
		})
	}

	_, err := RehydrationDDL{Kind: DDLDrop, Database: "db", Table: "signoz_logs"}.Statement("cluster")
	assert.True(t, errors.Asc(err, ErrCodeNotRehydratedTable), err)
}

func TestNewAddColumnsDDL(t *testing.T) {
	live := TableSchema{Database: "db", Name: "events", Columns: []SchemaColumn{{Name: "ts", Type: "DateTime"}, {Name: "env", Type: "String", DefaultKind: "DEFAULT", DefaultExpression: "'prod'"}}}

	ddl, ok := NewAddColumnsDDL(live, TableSchema{Database: "db", Name: "rehydrated_events", Columns: []SchemaColumn{{Name: "ts", Type: "DateTime"}, {Name: "rehydration_id", Type: "UUID"}}})
	require.True(t, ok)
	assert.Equal(t, RehydrationDDL{Kind: DDLAlter, Database: "db", Table: "rehydrated_events", Clause: "ADD COLUMN IF NOT EXISTS `env` String DEFAULT 'prod'"}, ddl)

	_, ok = NewAddColumnsDDL(live, TableSchema{Database: "db", Name: "rehydrated_events", Columns: live.Columns})
	assert.False(t, ok)
}

func readSchema(t *testing.T, table string) TableSchema {
	t.Helper()

	content, err := os.ReadFile(filepath.Join("testdata", table+".json"))
	require.NoError(t, err)
	var schema TableSchema
	require.NoError(t, json.Unmarshal(content, &schema))
	return schema
}
