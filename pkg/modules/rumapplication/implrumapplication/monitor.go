package implrumapplication

import (
	"slices"
	"sync"
	"time"

	"github.com/fuseone-io/fusescope/pkg/types/rumtypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
)

const (
	monitorBuckets          = int(rumtypes.StatusWindow / time.Minute)
	maxSessionsPerBucket    = 10000
	maxPendingUsageEntries  = 10000
	monitorBucketResolution = time.Minute
)

// monitor keeps per-application ingest statistics over the status window,
// and the key and application usage times waiting to be flushed.
type monitor struct {
	mu           sync.Mutex
	applications map[valuer.UUID]*applicationMonitor
	keysUsed     map[valuer.UUID]time.Time
	firstSeen    map[valuer.UUID]time.Time
	seen         map[valuer.UUID]struct{}
}

type applicationMonitor struct {
	buckets    [monitorBuckets]monitorBucket
	sdkName    string
	sdkVersion string
}

type monitorBucket struct {
	minute     int64
	sessions   map[string]struct{}
	views      int64
	errors     int64
	vitals     int64
	rejections map[rumtypes.RejectionReason]*rumtypes.IngestRejection
}

func newMonitor() *monitor {
	return &monitor{
		applications: map[valuer.UUID]*applicationMonitor{},
		keysUsed:     map[valuer.UUID]time.Time{},
		firstSeen:    map[valuer.UUID]time.Time{},
		seen:         map[valuer.UUID]struct{}{},
	}
}

func (monitor *monitor) ObserveIngest(applicationID valuer.UUID, keyID valuer.UUID, batch *rumtypes.IngestBatch, alreadySeen bool, now time.Time) {
	monitor.mu.Lock()
	defer monitor.mu.Unlock()

	bucket := monitor.bucket(applicationID, now)
	for _, sessionID := range batch.SessionIDs {
		if len(bucket.sessions) < maxSessionsPerBucket {
			bucket.sessions[sessionID] = struct{}{}
		}
	}
	bucket.views += batch.Views
	bucket.errors += batch.Errors
	bucket.vitals += batch.Vitals

	if batch.SDKName != "" {
		application := monitor.applications[applicationID]
		application.sdkName, application.sdkVersion = batch.SDKName, batch.SDKVersion
	}

	if len(monitor.keysUsed) < maxPendingUsageEntries {
		monitor.keysUsed[keyID] = now
	}

	if _, ok := monitor.seen[applicationID]; !ok && !alreadySeen {
		if _, pending := monitor.firstSeen[applicationID]; !pending {
			monitor.firstSeen[applicationID] = now
		}
	}
}

func (monitor *monitor) ObserveRejection(applicationID valuer.UUID, reason rumtypes.RejectionReason, origin string, now time.Time) {
	monitor.mu.Lock()
	defer monitor.mu.Unlock()

	bucket := monitor.bucket(applicationID, now)
	rejection, ok := bucket.rejections[reason]
	if !ok {
		rejection = &rumtypes.IngestRejection{Reason: reason}
		bucket.rejections[reason] = rejection
	}
	rejection.Count++
	rejection.LastOrigin = origin
	rejection.LastSeenAt = now
}

// Snapshot returns the counts, the SDK seen and the rejections of the window
// ending at now, plus a first-seen time not flushed yet.
func (monitor *monitor) Snapshot(applicationID valuer.UUID, now time.Time) (rumtypes.IngestCounts, rumtypes.SeenSDK, []*rumtypes.IngestRejection, *time.Time) {
	monitor.mu.Lock()
	defer monitor.mu.Unlock()

	counts := rumtypes.IngestCounts{}
	sdk := rumtypes.SeenSDK{Support: rumtypes.SDKSupportUnknown}
	rejections := []*rumtypes.IngestRejection{}
	var firstSeen *time.Time
	if pending, ok := monitor.firstSeen[applicationID]; ok {
		firstSeen = &pending
	}

	application, ok := monitor.applications[applicationID]
	if !ok {
		return counts, sdk, rejections, firstSeen
	}

	sessions := map[string]struct{}{}
	byReason := map[rumtypes.RejectionReason]*rumtypes.IngestRejection{}
	oldest := now.Truncate(monitorBucketResolution).Unix()/60 - int64(monitorBuckets) + 1
	for i := range application.buckets {
		bucket := &application.buckets[i]
		if bucket.sessions == nil || bucket.minute < oldest {
			continue
		}
		for sessionID := range bucket.sessions {
			sessions[sessionID] = struct{}{}
		}
		counts.Views += bucket.views
		counts.Errors += bucket.errors
		counts.Vitals += bucket.vitals
		mergeRejections(byReason, bucket.rejections)
	}
	counts.Sessions = int64(len(sessions))

	for _, rejection := range byReason {
		rejections = append(rejections, rejection)
	}
	slices.SortFunc(rejections, func(a, b *rumtypes.IngestRejection) int {
		return b.LastSeenAt.Compare(a.LastSeenAt)
	})

	sdk = rumtypes.SeenSDK{Name: application.sdkName, Version: application.sdkVersion, Support: rumtypes.SDKSupportOf(application.sdkName, application.sdkVersion)}
	return counts, sdk, rejections, firstSeen
}

// TakeUsage hands over the pending usage times; Restore puts back those that
// could not be written.
func (monitor *monitor) TakeUsage() (map[valuer.UUID]time.Time, map[valuer.UUID]time.Time) {
	monitor.mu.Lock()
	defer monitor.mu.Unlock()

	keysUsed, firstSeen := monitor.keysUsed, monitor.firstSeen
	monitor.keysUsed, monitor.firstSeen = map[valuer.UUID]time.Time{}, map[valuer.UUID]time.Time{}
	for applicationID := range firstSeen {
		monitor.seen[applicationID] = struct{}{}
	}
	return keysUsed, firstSeen
}

func (monitor *monitor) RestoreFirstSeen(applicationID valuer.UUID, seenAt time.Time) {
	monitor.mu.Lock()
	defer monitor.mu.Unlock()

	delete(monitor.seen, applicationID)
	if _, ok := monitor.firstSeen[applicationID]; !ok {
		monitor.firstSeen[applicationID] = seenAt
	}
}

func (monitor *monitor) Forget(applicationID valuer.UUID) {
	monitor.mu.Lock()
	defer monitor.mu.Unlock()

	delete(monitor.applications, applicationID)
	delete(monitor.firstSeen, applicationID)
	delete(monitor.seen, applicationID)
}

func (monitor *monitor) bucket(applicationID valuer.UUID, now time.Time) *monitorBucket {
	application, ok := monitor.applications[applicationID]
	if !ok {
		application = &applicationMonitor{}
		monitor.applications[applicationID] = application
	}

	minute := now.Truncate(monitorBucketResolution).Unix() / 60
	bucket := &application.buckets[minute%int64(monitorBuckets)]
	if bucket.sessions == nil || bucket.minute != minute {
		*bucket = monitorBucket{minute: minute, sessions: map[string]struct{}{}, rejections: map[rumtypes.RejectionReason]*rumtypes.IngestRejection{}}
	}
	return bucket
}

func mergeRejections(into map[rumtypes.RejectionReason]*rumtypes.IngestRejection, from map[rumtypes.RejectionReason]*rumtypes.IngestRejection) {
	for reason, rejection := range from {
		merged, ok := into[reason]
		if !ok {
			copied := *rejection
			into[reason] = &copied
			continue
		}
		merged.Count += rejection.Count
		if rejection.LastSeenAt.After(merged.LastSeenAt) {
			merged.LastSeenAt, merged.LastOrigin = rejection.LastSeenAt, rejection.LastOrigin
		}
	}
}
