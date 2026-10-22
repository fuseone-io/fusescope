package implrumapplication

import (
	"sync"
	"time"

	"github.com/fuseone-io/fusescope/pkg/modules/rumapplication"
)

const rateLimiterIdleTTL = 10 * time.Minute

// rateLimiter is a token bucket per identity. Idle buckets are dropped on the
// next call after rateLimiterIdleTTL, which bounds memory to active clients.
type rateLimiter struct {
	limit     rumapplication.LimitConfig
	mu        sync.Mutex
	buckets   map[string]*tokenBucket
	lastSweep time.Time
}

type tokenBucket struct {
	tokens float64
	last   time.Time
}

func newRateLimiter(limit rumapplication.LimitConfig) *rateLimiter {
	return &rateLimiter{limit: limit, buckets: map[string]*tokenBucket{}}
}

func (limiter *rateLimiter) Allow(identity string, now time.Time) bool {
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

func (limiter *rateLimiter) sweep(now time.Time) {
	if now.Sub(limiter.lastSweep) < rateLimiterIdleTTL {
		return
	}

	for identity, bucket := range limiter.buckets {
		if now.Sub(bucket.last) > rateLimiterIdleTTL {
			delete(limiter.buckets, identity)
		}
	}
	limiter.lastSweep = now
}
