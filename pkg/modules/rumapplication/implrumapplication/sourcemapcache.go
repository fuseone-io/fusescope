package implrumapplication

import (
	"container/list"
	"sync"

	"github.com/fuseone-io/fusescope/pkg/types/rumtypes"
)

// sourceMapCache keeps decoded maps by file id, least recently used out
// first, within capacity bytes of their estimated memory.
type sourceMapCache struct {
	mu       sync.Mutex
	capacity int64
	size     int64
	order    *list.List
	entries  map[string]*list.Element
}

type sourceMapCacheEntry struct {
	key       string
	sourceMap *rumtypes.SourceMap
}

func newSourceMapCache(capacity int64) *sourceMapCache {
	return &sourceMapCache{capacity: capacity, order: list.New(), entries: map[string]*list.Element{}}
}

func (cache *sourceMapCache) Get(key string) (*rumtypes.SourceMap, bool) {
	cache.mu.Lock()
	defer cache.mu.Unlock()

	element, ok := cache.entries[key]
	if !ok {
		return nil, false
	}
	cache.order.MoveToFront(element)
	return element.Value.(*sourceMapCacheEntry).sourceMap, true
}

func (cache *sourceMapCache) Add(key string, sourceMap *rumtypes.SourceMap) {
	cache.mu.Lock()
	defer cache.mu.Unlock()

	if sourceMap.Size() > cache.capacity {
		return
	}
	cache.remove(key)
	cache.entries[key] = cache.order.PushFront(&sourceMapCacheEntry{key: key, sourceMap: sourceMap})
	cache.size += sourceMap.Size()
	for cache.size > cache.capacity {
		cache.remove(cache.order.Back().Value.(*sourceMapCacheEntry).key)
	}
}

func (cache *sourceMapCache) Remove(key string) {
	cache.mu.Lock()
	defer cache.mu.Unlock()

	cache.remove(key)
}

func (cache *sourceMapCache) Size() int64 {
	cache.mu.Lock()
	defer cache.mu.Unlock()

	return cache.size
}

func (cache *sourceMapCache) remove(key string) {
	element, ok := cache.entries[key]
	if !ok {
		return
	}
	cache.order.Remove(element)
	delete(cache.entries, key)
	cache.size -= element.Value.(*sourceMapCacheEntry).sourceMap.Size()
}
