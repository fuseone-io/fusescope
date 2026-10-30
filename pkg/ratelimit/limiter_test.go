package ratelimit

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

func TestLimiterAllow(t *testing.T) {
	start := time.Date(2026, 10, 21, 12, 0, 0, 0, time.UTC)

	testCases := []struct {
		name     string
		limit    Limit
		requests []time.Duration
		expected []bool
	}{
		{
			name:     "BurstThenRejected",
			limit:    Limit{Rate: 1, Burst: 2},
			requests: []time.Duration{0, 0, 0},
			expected: []bool{true, true, false},
		},
		{
			name:     "RefillsAtRate",
			limit:    Limit{Rate: 2, Burst: 1},
			requests: []time.Duration{0, 100 * time.Millisecond, 500 * time.Millisecond, 600 * time.Millisecond},
			expected: []bool{true, false, true, false},
		},
		{
			name:     "NeverExceedsBurst",
			limit:    Limit{Rate: 100, Burst: 2},
			requests: []time.Duration{0, time.Hour, time.Hour, time.Hour},
			expected: []bool{true, true, true, false},
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			limiter := NewLimiter(testCase.limit)
			for i, offset := range testCase.requests {
				assert.Equal(t, testCase.expected[i], limiter.Allow("key", start.Add(offset)), "request %d", i)
			}
		})
	}
}

func TestLimiterIsolatesIdentities(t *testing.T) {
	now := time.Date(2026, 10, 21, 12, 0, 0, 0, time.UTC)
	limiter := NewLimiter(Limit{Rate: 1, Burst: 1})

	assert.True(t, limiter.Allow("key-a|10.0.0.1", now))
	assert.False(t, limiter.Allow("key-a|10.0.0.1", now))
	assert.True(t, limiter.Allow("key-a|10.0.0.2", now))
	assert.True(t, limiter.Allow("key-b|10.0.0.1", now))
}

func TestLimiterSweepsIdleBuckets(t *testing.T) {
	now := time.Date(2026, 10, 21, 12, 0, 0, 0, time.UTC)
	limiter := NewLimiter(Limit{Rate: 1, Burst: 1})

	limiter.Allow("idle", now)
	limiter.Allow("other", now.Add(2*idleTTL))

	assert.Len(t, limiter.buckets, 1)
}
