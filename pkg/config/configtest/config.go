package configtest

import (
	"github.com/fuseone-io/fusescope/pkg/config"
	"github.com/fuseone-io/fusescope/pkg/config/envprovider"
)

func NewResolverConfig() config.ResolverConfig {
	return config.ResolverConfig{
		Uris:              []string{"env:"},
		ProviderFactories: []config.ProviderFactory{envprovider.NewFactory()},
	}
}
