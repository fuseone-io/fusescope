package clickhousetelemetrystore

import (
	"reflect"
	"testing"

	cmock "github.com/SigNoz/clickhouse-go-mock"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNewRows(t *testing.T) {
	rows := NewRows(cmock.NewRows(
		[]cmock.ColumnType{
			{Name: "service", Type: "String"},
			{Name: "calls", Type: "UInt64"},
			{Name: "status", Type: "Nullable(String)"},
		},
		[][]any{
			{"api", uint64(3), nil},
			{"web", uint64(5), "ok"},
		},
	))

	assert.Equal(t, []string{"service", "calls", "status"}, rows.Columns())
	types := rows.ColumnTypes()
	require.Len(t, types, 3)
	assert.Equal(t, "UInt64", types[1].DatabaseTypeName())
	assert.Equal(t, reflect.TypeFor[uint64](), types[1].ScanType())
	assert.False(t, types[1].Nullable())
	assert.True(t, types[2].Nullable())
	assert.Equal(t, "status", types[2].Name())

	var (
		service string
		calls   uint64
		status  *string
	)
	require.True(t, rows.Next())
	require.NoError(t, rows.Scan(&service, &calls, &status))
	assert.Equal(t, "api", service)
	assert.Nil(t, status)
	require.True(t, rows.Next())
	require.NoError(t, rows.Scan(&service, &calls, &status))
	require.NotNil(t, status)
	assert.Equal(t, "ok", *status)
	assert.False(t, rows.Next())
	assert.NoError(t, rows.Err())
	assert.Nil(t, rows.Warnings())
	assert.NoError(t, rows.Close())
	assert.NoError(t, rows.Close(), "a second close releases nothing")
}
