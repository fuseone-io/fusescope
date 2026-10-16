package noopsharder

import (
	"context"
	"math"

	"github.com/fuseone-io/fusescope/pkg/factory"
	"github.com/fuseone-io/fusescope/pkg/sharder"
)

type provider struct {
	settings factory.ScopedProviderSettings
}

func NewFactory() factory.ProviderFactory[sharder.Sharder, sharder.Config] {
	return factory.NewProviderFactory(factory.MustNewName("noop"), New)
}

func New(ctx context.Context, providerSettings factory.ProviderSettings, config sharder.Config) (sharder.Sharder, error) {
	settings := factory.NewScopedProviderSettings(providerSettings, "github.com/fuseone-io/fusescope/pkg/sharder/noopsharder")

	return &provider{
		settings: settings,
	}, nil
}

func (provider *provider) GetMyOwnedKeyRange(ctx context.Context) (uint32, uint32, error) {
	return 0, math.MaxUint32, nil
}

func (provider *provider) IsMyOwnedKey(ctx context.Context, key uint32) error {
	return nil
}
