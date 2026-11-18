package watchdogtypes

import (
	"time"
)

const (
	BucketStep    = 5 * time.Minute
	WindowBuckets = 3
	// IngestionLag keeps the window clear of spans still being ingested.
	IngestionLag = 2 * time.Minute
	// Seasons are the daily baselines, one to Seasons days before the window.
	Seasons = 4
	season  = 24 * time.Hour
)

// Window is the evaluated span of time. End identifies an evaluation, so a
// retry or a failover evaluates the same window.
type Window struct {
	Start time.Time
	End   time.Time
}

func NewWindow(now time.Time) Window {
	end := now.UTC().Add(-IngestionLag).Truncate(BucketStep)
	return Window{Start: end.Add(-WindowBuckets * BucketStep), End: end}
}

// Buckets are the start timestamps of the window's buckets, in milliseconds,
// as time series results carry them.
func (window Window) Buckets() []int64 {
	buckets := make([]int64, WindowBuckets)
	for i := range buckets {
		buckets[i] = window.Start.Add(time.Duration(i) * BucketStep).UnixMilli()
	}
	return buckets
}

// SeasonShift is the timeShift argument, in seconds, of the k-th baseline.
func SeasonShift(k int) int64 {
	return int64(k) * int64(season/time.Second)
}
