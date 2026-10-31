package implarchive

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/fuseone-io/fusescope/pkg/types/archivetypes"
)

func TestTableDDL(t *testing.T) {
	table := restoreTable{local: "events", distributed: "distributed_events"}
	live := archivetypes.TableSchema{Database: "db", Name: "events", Engine: "MergeTree", EngineFull: "MergeTree ORDER BY ts", SortingKey: "ts", Columns: []archivetypes.SchemaColumn{{Name: "ts", Type: "DateTime"}, {Name: "env", Type: "String"}}}
	distributed := archivetypes.TableSchema{Database: "db", Name: "distributed_events", Engine: "Distributed", EngineFull: "Distributed('cluster', 'db', 'events', rand())"}
	older := []archivetypes.SchemaColumn{{Name: "ts", Type: "DateTime"}, {Name: "rehydration_id", Type: "UUID"}}

	testCases := []struct {
		name     string
		schemas  map[string]archivetypes.TableSchema
		expected []string
		wantErr  bool
	}{
		{
			name:     "NoRehydratedTables_Created",
			schemas:  map[string]archivetypes.TableSchema{"events": live, "distributed_events": distributed},
			expected: []string{"create rehydrated_events", "create rehydrated_distributed_events"},
		},
		{
			name: "LiveGainedColumn_AddedToBoth",
			schemas: map[string]archivetypes.TableSchema{
				"events": live, "distributed_events": distributed,
				"rehydrated_events":             {Database: "db", Name: "rehydrated_events", Columns: older},
				"rehydrated_distributed_events": {Database: "db", Name: "rehydrated_distributed_events", Columns: older},
			},
			expected: []string{"create rehydrated_events", "alter rehydrated_events", "create rehydrated_distributed_events", "alter rehydrated_distributed_events"},
		},
		{
			name:    "LiveTableMissing_Error",
			schemas: map[string]archivetypes.TableSchema{"events": live},
			wantErr: true,
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			ddl, err := tableDDL(testCase.schemas, table)
			if testCase.wantErr {
				assert.Error(t, err)
				return
			}
			require.NoError(t, err)
			var actual []string
			for _, statement := range ddl {
				actual = append(actual, statement.Kind+" "+statement.Table)
				if statement.Kind == archivetypes.DDLAlter {
					assert.Equal(t, "ADD COLUMN IF NOT EXISTS `env` String", statement.Clause)
				}
			}
			assert.Equal(t, testCase.expected, actual)
		})
	}
}
