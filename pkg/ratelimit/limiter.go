package ratelimit

import (
	"sync"
	"time"
)

const idleTTL = 10 * time.Minute

// Limiter is an in-memory token bucket per identity. Idle buckets are dropped on
// the next call after idleTTL, which bounds memory to active identities.
type Limiter struct {
	limit     Limit
	mu        sync.Mutex
	buckets   map[string]*tokenBucket
	lastSweep time.Time
}

type tokenBucket struct {
	tokens float64
	last   time.Time
}

func NewLimiter(limit Limit) *Limiter {
	return &Limiter{limit: limit, buckets: map[string]*tokenBucket{}}
}

func (limiter *Limiter) Allow(identity string, now time.Time) bool {
	limiter.mu.Lock()
	defer limiter.mu.Unlock()

	limiter.sweep(now)

	burst := float64(limiter.limit.Burst)
	bucket, ok := limiter.buckets[identity]
	if !ok {
		bucket = &tokenBucket{tokens: burst, last: now}
		limiter.buckets[identity] = bucket
	}

	if elapsed := now.Sub(bucket.last).Seconds(); elapsed > 0 {
		bucket.tokens = min(burst, bucket.tokens+elapsed*limiter.limit.Rate)
		bucket.last = now
	}

	if bucket.tokens < 1 {
		return false
	}

	bucket.tokens--
	return true
}

func (limiter *Limiter) sweep(now time.Time) {
	if now.Sub(limiter.lastSweep) < idleTTL {
		return
	}

	for identity, bucket := range limiter.buckets {
		if now.Sub(bucket.last) > idleTTL {
			delete(limiter.buckets, identity)
		}
	}
	limiter.lastSweep = now
}
