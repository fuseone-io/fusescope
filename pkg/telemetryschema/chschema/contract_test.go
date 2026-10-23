package chschema_test

import (
	"strings"
	"testing"

	"github.com/fuseone-io/fusescope/pkg/telemetryschema/chschema"
	"github.com/fuseone-io/fusescope/pkg/telemetryschema/chschema/chschematest"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// The schemacontract integration suite checks that ClickHouse stores each
// contract DDL's expression as the contract's stored form.
func TestJSONSubColumnIndexContract(t *testing.T) {
	samples := chschematest.Load(t).JSONSubColumnIndexes
	require.NotEmpty(t, samples)

	for _, sample := range samples {
		t.Run(sample.Column+"."+sample.Path, func(t *testing.T) {
			expression := chschema.JSONSubColumnIndexExpr(sample.Column, sample.Path, sample.JSONDataType)
			stmt := chschema.AlterTableAddIndex{
				Database: "signoz_logs",
				Table:    "logs_v2",
				Index: chschema.Index{
					Name:        chschema.JSONSubColumnIndexName(sample.Column, sample.Path, strings.ToLower(sample.JSONDataType), chschema.IndexTypeMinMax),
					Expression:  expression,
					Type:        string(chschema.IndexTypeMinMax),
					Granularity: 1,
				},
			}
			assert.Equal(t, sample.DDL, stmt.OnCluster("cluster").ToSQL())

			column, jsonDataType, err := chschema.UnfoldJSONSubColumnIndexExpr(sample.Stored)
			require.NoError(t, err)
			assert.Contains(t, expression, "("+column+", ")
			assert.Equal(t, sample.JSONDataType, jsonDataType)
		})
	}
}
