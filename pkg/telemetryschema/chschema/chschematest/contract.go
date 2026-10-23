// Package chschematest checks chschema descriptors against the schema contract
// file. The schemacontract integration suite checks the same file against the
// tables the schema migrator creates, so a descriptor and the live schema can
// only drift apart by editing the contract.
package chschematest

import (
	"encoding/json"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"github.com/fuseone-io/fusescope/pkg/telemetryschema/chschema"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ContractFile is relative to the repository root.
const ContractFile = "tests/integration/testdata/schemacontract.json"

type Contract struct {
	Tables               []Table              `json:"tables"`
	JSONSubColumnIndexes []JSONSubColumnIndex `json:"json_sub_column_indexes"`
}

type Table struct {
	Database string   `json:"database"`
	Name     string   `json:"name"`
	Columns  []Column `json:"columns"`
	Indexes  []string `json:"indexes,omitempty"`
}

// Column is a descriptor as chschema renders it. LiveType, when set, is the
// type the migrator creates where it knowingly differs from the descriptor.
type Column struct {
	Name     string `json:"name"`
	Type     string `json:"type"`
	LiveType string `json:"live_type,omitempty"`
	Note     string `json:"note,omitempty"`
}

// JSONSubColumnIndex is a skip index DDL built by chschema and the expression
// ClickHouse stores for it.
type JSONSubColumnIndex struct {
	Column       string `json:"column"`
	Path         string `json:"path"`
	JSONDataType string `json:"json_data_type"`
	DDL          string `json:"ddl"`
	Stored       string `json:"stored"`
}

func Load(t *testing.T) Contract {
	t.Helper()

	data, err := os.ReadFile(filepath.Join(repositoryRoot(t), ContractFile))
	require.NoError(t, err)

	var contract Contract
	require.NoError(t, json.Unmarshal(data, &contract))
	return contract
}

// AssertTable fails unless the contract describes database.name with exactly
// these columns and index expressions.
func AssertTable(t *testing.T, database, name string, columns map[string]*chschema.Column, indexes ...string) {
	t.Helper()

	want := Table{Database: database, Name: name, Indexes: indexes}
	for _, column := range columns {
		want.Columns = append(want.Columns, Column{Name: column.Name, Type: column.Type.String()})
	}
	slices.SortFunc(want.Columns, func(a, b Column) int { return strings.Compare(a.Name, b.Name) })

	contract := Load(t)
	index := slices.IndexFunc(contract.Tables, func(table Table) bool { return table.Database == database && table.Name == name })
	expected, _ := json.MarshalIndent(want, "    ", "  ")
	require.NotEqual(t, -1, index, "%s is missing %s.%s:\n%s", ContractFile, database, name, expected)

	got := contract.Tables[index]
	for i := range got.Columns {
		got.Columns[i].LiveType, got.Columns[i].Note = "", ""
	}
	assert.Equal(t, want, got, "%s is out of date for %s.%s; expected:\n%s", ContractFile, database, name, expected)
}

func repositoryRoot(t *testing.T) string {
	t.Helper()

	dir, err := os.Getwd()
	require.NoError(t, err)
	for {
		if _, err := os.Stat(filepath.Join(dir, "go.mod")); err == nil {
			return dir
		}
		parent := filepath.Dir(dir)
		require.NotEqual(t, dir, parent, "go.mod not found above the test directory")
		dir = parent
	}
}
