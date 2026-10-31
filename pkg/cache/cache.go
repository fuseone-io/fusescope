package cache

import (
	"context"
	"time"

	v3 "github.com/fuseone-io/fusescope/pkg/query-service/model/v3"
	"github.com/fuseone-io/fusescope/pkg/types/cachetypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
)

type Cache interface {
	// Set sets the cacheable entity in cache.
	Set(ctx context.Context, orgID valuer.UUID, cacheKey string, data cachetypes.Cacheable, ttl time.Duration) error

	// SetIfAbsent sets the cacheable entity only when the key is not cached, atomically
	// for the cache's scope (per process for memory, shared for redis), and reports
	// whether it was set.
	SetIfAbsent(ctx context.Context, orgID valuer.UUID, cacheKey string, data cachetypes.Cacheable, ttl time.Duration) (bool, error)

	// Get gets the cacheble entity in the dest entity passed.
	Get(ctx context.Context, orgID valuer.UUID, cacheKey string, dest cachetypes.Cacheable) error

	// Delete deletes the cacheable entity from cache
	Delete(ctx context.Context, orgID valuer.UUID, cacheKey string)

	// DeleteMany deletes multiple cacheble entities from cache
	DeleteMany(ctx context.Context, orgID valuer.UUID, cacheKeys []string)
}

type KeyGenerator interface {
	// GenerateKeys generates the cache keys for the given query range params
	// The keys are returned as a map where the key is the query name and the value is the cache key
	GenerateKeys(*v3.QueryRangeParamsV3) map[string]string
}
