package preferencetypes

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNewAvailablePreference(t *testing.T) {
	assert.NotPanics(t, func() {
		available := NewAvailablePreference()
		assert.NotNil(t, available)
	})
}

func TestIngestionURLPreference(t *testing.T) {
	available := NewAvailablePreference()

	name, err := NewName("ingestion_url")
	require.NoError(t, err)
	assert.Equal(t, NameIngestionURL, name)

	preference, err := NewPreference(NameIngestionURL, ScopeOrg, available)
	require.NoError(t, err)
	assert.Equal(t, ValueTypeString, preference.ValueType)
	assert.Equal(t, "", preference.Value.GoValue())

	value, err := NewValueFromString(`"https://otlp.acme.io"`, ValueTypeString)
	require.NoError(t, err)
	require.NoError(t, preference.UpdateValue(value))
	assert.Equal(t, "https://otlp.acme.io", preference.Value.GoValue())

	_, err = NewPreference(NameIngestionURL, ScopeUser, available)
	assert.Error(t, err)
}
