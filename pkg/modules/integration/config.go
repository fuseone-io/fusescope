// Package integration holds the configuration of the integrations the
// backend installs by itself.
package integration

import (
	"regexp"
	"time"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/factory"
)

var ErrCodeInvalidConfig = errors.MustNewCode("integrations_invalid_config")

// builtinID matches the ids of the official catalog's packages, as the
// catalog's schema allows them.
var builtinID = regexp.MustCompile(`^builtin-[a-z0-9_]+(-[a-z0-9_]+)*$`)

type Config struct {
	// AutoInstall lists the built-in integrations installed in every
	// organization, existing and new, once. Removing an id installs nothing
	// more and uninstalls nothing; an organization that uninstalled one is
	// never given it again. Empty by default.
	AutoInstall []string `mapstructure:"autoinstall"`

	// How often organizations are checked for an integration to install;
	// this also picks up the organizations created since.
	ReconcileInterval time.Duration `mapstructure:"reconcile_interval"`
}

func NewConfigFactory() factory.ConfigFactory {
	return factory.NewConfigFactory(factory.MustNewName("integrations"), newConfig)
}

func newConfig() factory.Config {
	return &Config{ReconcileInterval: time.Minute}
}

// Validate checks the configuration's form; the ids are checked against the
// catalog when the integrations are loaded.
func (c Config) Validate() error {
	seen := map[string]bool{}
	for _, id := range c.AutoInstall {
		if !builtinID.MatchString(id) {
			return errors.Newf(errors.TypeInvalidInput, ErrCodeInvalidConfig, "integrations.autoinstall: %q is not a built-in integration id", id)
		}
		if seen[id] {
			return errors.Newf(errors.TypeInvalidInput, ErrCodeInvalidConfig, "integrations.autoinstall: %s is listed twice", id)
		}
		seen[id] = true
	}
	if c.ReconcileInterval <= 0 {
		return errors.New(errors.TypeInvalidInput, ErrCodeInvalidConfig, "integrations.reconcile_interval must be positive")
	}
	return nil
}
