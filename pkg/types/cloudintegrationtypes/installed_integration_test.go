package cloudintegrationtypes

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestInstalledIntegrationConfigValueIsText(t *testing.T) {
	config := InstalledIntegrationConfig{"key": "value"}

	value, err := config.Value()
	require.NoError(t, err)
	assert.Equal(t, `{"key":"value"}`, value, "a []byte value is stored as bytea hex in a PostgreSQL text column")

	var scanned InstalledIntegrationConfig
	require.NoError(t, scanned.Scan(value))
	assert.Equal(t, config, scanned)
}
