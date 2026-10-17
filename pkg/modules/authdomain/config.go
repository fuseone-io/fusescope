package authdomain

import (
	"encoding/json"
	"os"
	"regexp"
	"strings"
	"time"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/factory"
	"github.com/fuseone-io/fusescope/pkg/types/authtypes"
)

// environmentReference matches ${NAME}; a bare $ is left alone so secrets may contain it.
var environmentReference = regexp.MustCompile(`\$\{([A-Za-z_][A-Za-z0-9_]*)\}`)

type Config struct {
	// Domains declared here are created or updated at startup and on organization
	// creation, deleted when removed from the file, and read-only through the API.
	Domains []DomainConfig `mapstructure:"domains"`

	// How often the declared domains are re-applied, which also picks up
	// organizations created after startup.
	ReconcileInterval time.Duration `mapstructure:"reconcile_interval"`
}

type DomainConfig struct {
	// Email domain whose users sign in through this provider, e.g. example.com.
	Name string `mapstructure:"name"`

	// Organization id or name. May be empty when there is a single organization.
	Org string `mapstructure:"org"`

	// Defaults to true.
	Enabled *bool `mapstructure:"enabled"`

	// Same shape as the auth domain API: {kind: oidc|google, spec: {...}}.
	// String values may reference environment variables as ${NAME}.
	Config map[string]any `mapstructure:"config"`

	// Same shape as the auth domain API: {defaultRole, groupMappings, useRoleAttribute}.
	RoleMapping map[string]any `mapstructure:"role_mapping"`
}

type ManagedDomain struct {
	Org      string
	Postable *authtypes.PostableAuthDomain
}

func NewConfigFactory() factory.ConfigFactory {
	return factory.NewConfigFactory(factory.MustNewName("authdomain"), newConfig)
}

func newConfig() factory.Config {
	return Config{ReconcileInterval: time.Minute}
}

func (c Config) Validate() error {
	if c.ReconcileInterval <= 0 {
		return errors.Newf(errors.TypeInvalidInput, authtypes.ErrCodeAuthDomainInvalidConfig, "authdomain: reconcile_interval must be positive")
	}

	_, err := c.ManagedDomains()
	return err
}

// ManagedDomains decodes the declared domains through the same validation as the
// auth domain API, after expanding ${NAME} environment references.
func (c Config) ManagedDomains() ([]ManagedDomain, error) {
	domains := make([]ManagedDomain, 0, len(c.Domains))
	seen := make(map[string]struct{}, len(c.Domains))

	for _, domain := range c.Domains {
		postable, err := domain.postable()
		if err != nil {
			return nil, err
		}

		key := strings.ToLower(postable.Name)
		if _, ok := seen[key]; ok {
			return nil, errors.Newf(errors.TypeInvalidInput, authtypes.ErrCodeAuthDomainAlreadyExists, "authdomain: domain %q is declared more than once", postable.Name)
		}
		seen[key] = struct{}{}

		domains = append(domains, ManagedDomain{Org: domain.Org, Postable: postable})
	}

	return domains, nil
}

func (domain DomainConfig) postable() (*authtypes.PostableAuthDomain, error) {
	if domain.Config == nil {
		return nil, errors.Newf(errors.TypeInvalidInput, authtypes.ErrCodeAuthDomainInvalidConfig, "authdomain: domain %q has no config", domain.Name)
	}

	enabled := true
	if domain.Enabled != nil {
		enabled = *domain.Enabled
	}

	config, err := expandEnvironment(domain.Config)
	if err != nil {
		return nil, errors.Wrapf(err, errors.TypeInvalidInput, authtypes.ErrCodeAuthDomainInvalidConfig, "authdomain: domain %q", domain.Name)
	}

	payload := map[string]any{"name": domain.Name, "enabled": enabled, "config": config}
	if domain.RoleMapping != nil {
		payload["roleMapping"] = domain.RoleMapping
	}

	data, err := json.Marshal(payload)
	if err != nil {
		return nil, errors.Wrapf(err, errors.TypeInvalidInput, authtypes.ErrCodeAuthDomainInvalidConfig, "authdomain: domain %q", domain.Name)
	}

	postable := new(authtypes.PostableAuthDomain)
	if err := json.Unmarshal(data, postable); err != nil {
		return nil, errors.Wrapf(err, errors.TypeInvalidInput, authtypes.ErrCodeAuthDomainInvalidConfig, "authdomain: domain %q", domain.Name)
	}

	return postable, nil
}

func expandEnvironment(value any) (any, error) {
	switch typed := value.(type) {
	case string:
		var missing []string
		expanded := environmentReference.ReplaceAllStringFunc(typed, func(reference string) string {
			name := environmentReference.FindStringSubmatch(reference)[1]
			resolved, ok := os.LookupEnv(name)
			if !ok {
				missing = append(missing, name)
			}
			return resolved
		})
		if len(missing) > 0 {
			return nil, errors.Newf(errors.TypeInvalidInput, errors.CodeInvalidInput, "environment variable %s is not set", strings.Join(missing, ", "))
		}
		return expanded, nil
	case map[string]any:
		result := make(map[string]any, len(typed))
		for key, item := range typed {
			expanded, err := expandEnvironment(item)
			if err != nil {
				return nil, err
			}
			result[key] = expanded
		}
		return result, nil
	case []any:
		result := make([]any, len(typed))
		for i, item := range typed {
			expanded, err := expandEnvironment(item)
			if err != nil {
				return nil, err
			}
			result[i] = expanded
		}
		return result, nil
	}

	return value, nil
}
