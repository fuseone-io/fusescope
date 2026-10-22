package implrumapplication

import (
	"sync"
	"time"

	"github.com/fuseone-io/fusescope/pkg/types/rumtypes"
)

const maxKeyCacheEntries = 10000

// keyCache maps key hashes to their lookup result, a miss included, so bad
// keys do not reach the database on every request. Any change to an
// application or a key clears it; other instances catch up within the TTL.
type keyCache struct {
	ttl     time.Duration
	mu      sync.RWMutex
	entries map[string]keyCacheEntry
}

type keyCacheEntry struct {
	application *rumtypes.Application
	key         *rumtypes.ApplicationKey
	expiresAt   time.Time
}

func newKeyCache(ttl time.Duration) *keyCache {
	return &keyCache{ttl: ttl, entries: map[string]keyCacheEntry{}}
}

func (cache *keyCache) Get(hash string, now time.Time) (keyCacheEntry, bool) {
	cache.mu.RLock()
	defer cache.mu.RUnlock()

	entry, ok := cache.entries[hash]
	if !ok || !now.Before(entry.expiresAt) {
		return keyCacheEntry{}, false
	}
	return entry, true
}

func (cache *keyCache) Set(hash string, application *rumtypes.Application, key *rumtypes.ApplicationKey, now time.Time) {
	cache.mu.Lock()
	defer cache.mu.Unlock()

	if len(cache.entries) >= maxKeyCacheEntries {
		cache.entries = map[string]keyCacheEntry{}
	}
	cache.entries[hash] = keyCacheEntry{application: application, key: key, expiresAt: now.Add(cache.ttl)}
}

func (cache *keyCache) Clear() {
	cache.mu.Lock()
	defer cache.mu.Unlock()

	cache.entries = map[string]keyCacheEntry{}
}
