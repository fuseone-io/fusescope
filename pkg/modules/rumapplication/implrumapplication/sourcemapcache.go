package implrumapplication

import (
	"container/list"
	"sync"
)

// cachedArtifact is a parsed source map or R8 mapping.
type cachedArtifact interface {
	Size() int64
}

// sourceMapCache keeps parsed artifacts by file id, least recently used out
// first, within capacity bytes of their estimated memory.
type sourceMapCache struct {
	mu       sync.Mutex
	capacity int64
	size     int64
	order    *list.List
	entries  map[string]*list.Element
}

type sourceMapCacheEntry struct {
	key      string
	artifact cachedArtifact
}

func newSourceMapCache(capacity int64) *sourceMapCache {
	return &sourceMapCache{capacity: capacity, order: list.New(), entries: map[string]*list.Element{}}
}

func (cache *sourceMapCache) Get(key string) (cachedArtifact, bool) {
	cache.mu.Lock()
	defer cache.mu.Unlock()

	element, ok := cache.entries[key]
	if !ok {
		return nil, false
	}
	cache.order.MoveToFront(element)
	return element.Value.(*sourceMapCacheEntry).artifact, true
}

func (cache *sourceMapCache) Add(key string, artifact cachedArtifact) {
	cache.mu.Lock()
	defer cache.mu.Unlock()

	if artifact.Size() > cache.capacity {
		return
	}
	cache.remove(key)
	cache.entries[key] = cache.order.PushFront(&sourceMapCacheEntry{key: key, artifact: artifact})
	cache.size += artifact.Size()
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
	cache.size -= element.Value.(*sourceMapCacheEntry).artifact.Size()
}
