package cachetest

import (
	"context"

	"github.com/fuseone-io/fusescope/pkg/cache"
	"github.com/fuseone-io/fusescope/pkg/cache/memorycache"
	"github.com/fuseone-io/fusescope/pkg/factory/factorytest"
)

func New(config cache.Config) (cache.Cache, error) {
	cache, err := memorycache.New(context.TODO(), factorytest.NewSettings(), config)
	if err != nil {
		return nil, err
	}

	return cache, nil
}
