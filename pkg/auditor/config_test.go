package auditor

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestDefaultProviderIsNoop(t *testing.T) {
	config := newConfig().(Config)
	assert.Equal(t, "noop", config.Provider)
	assert.NoError(t, config.Validate())
}
