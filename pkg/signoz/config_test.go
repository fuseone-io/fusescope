package signoz

import (
	"context"
	"log/slog"
	"testing"
	"time"

	"github.com/fuseone-io/fusescope/pkg/config/configtest"
	"github.com/stretchr/testify/assert"
)

// This is a test to ensure that all fields of config implement the factory.Config interface and are valid with
// their default values.
func TestValidateConfig(t *testing.T) {
	logger := slog.New(slog.DiscardHandler)
	_, err := NewConfig(context.Background(), logger, configtest.NewResolverConfig())
	assert.NoError(t, err)
}

// The chart sets the integrations to install as one comma-separated
// variable; underscores inside a key are doubled.
func TestIntegrationsConfigFromEnv(t *testing.T) {
	t.Setenv("SIGNOZ_INTEGRATIONS_AUTOINSTALL", "builtin-fusescope_collector,builtin-redis")
	t.Setenv("SIGNOZ_INTEGRATIONS_RECONCILE__INTERVAL", "30s")
	config, err := NewConfig(context.Background(), slog.New(slog.DiscardHandler), configtest.NewResolverConfig())
	assert.NoError(t, err)
	assert.Equal(t, []string{"builtin-fusescope_collector", "builtin-redis"}, config.Integrations.AutoInstall)
	assert.Equal(t, 30*time.Second, config.Integrations.ReconcileInterval)
}

func TestIntegrationsConfigRefusesAnInvalidID(t *testing.T) {
	t.Setenv("SIGNOZ_INTEGRATIONS_AUTOINSTALL", "redis")
	_, err := NewConfig(context.Background(), slog.New(slog.DiscardHandler), configtest.NewResolverConfig())
	assert.ErrorContains(t, err, `"redis" is not a built-in integration id`)
}
