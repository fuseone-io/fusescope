package implrumapplication

import (
	"context"
	"encoding/json"
	"math"
	"slices"
	"time"

	"github.com/fuseone-io/fusescope/pkg/modules/rumapplication"
	"github.com/fuseone-io/fusescope/pkg/types/ingesttypes"
	"github.com/fuseone-io/fusescope/pkg/types/rumtypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
)

// reportFreshness is how old a collector's report may be and still count:
// a collector reports every minute, so an older one is of a collector
// gone or cut off, whose window is out of date.
const reportFreshness = 3 * time.Minute

func (module *module) RecordIngestUsage(ctx context.Context, usage *rumapplication.IngestUsage) error {
	if err := module.store.SetFirstSeenAtEarliest(ctx, usage.FirstSeen); err != nil {
		return err
	}
	return module.store.SetKeysLastUsedAtLatest(ctx, usage.LastUsed)
}

func (module *module) KnownApplications(ctx context.Context, ids []valuer.UUID) (map[valuer.UUID]bool, error) {
	return module.store.KnownApplicationIDs(ctx, ids)
}

// addCount adds two non-negative counts, saturating: reports of many
// collectors, each within int64, must not wrap to a negative total.
func addCount(a, b int64) int64 {
	if b > math.MaxInt64-a {
		return math.MaxInt64
	}
	return a + b
}

// reportedStatus sums the latest report of every collector for the
// application: counts add up, rejections merge by reason keeping the newest
// origin, and the SDK is that of the newest report naming one.
func (module *module) reportedStatus(ctx context.Context, id valuer.UUID) (rumtypes.IngestCounts, *rumtypes.SeenSDK, []*rumtypes.IngestRejection, error) {
	counts := rumtypes.IngestCounts{}
	now, err := module.store.DatabaseNow(ctx)
	if err != nil {
		return counts, nil, nil, err
	}
	rows, err := module.store.ListReportedApplication(ctx, id, now.Add(-reportFreshness))
	if err != nil {
		return counts, nil, nil, err
	}

	var sdk *rumtypes.SeenSDK
	var sdkAt time.Time
	byReason := map[rumtypes.RejectionReason]*rumtypes.IngestRejection{}
	for _, row := range rows {
		counts = addCounts(counts, rumtypes.IngestCounts{Sessions: row.Sessions, Views: row.Views, Errors: row.Errors, Vitals: row.Vitals})
		if row.SDKName != "" && (sdk == nil || row.ReportedAt.After(sdkAt)) {
			sdk, sdkAt = &rumtypes.SeenSDK{Name: row.SDKName, Version: row.SDKVersion, Support: rumtypes.SDKSupportOf(row.SDKName, row.SDKVersion)}, row.ReportedAt
		}
		var rejections []ingesttypes.ReportedRejection
		if err := json.Unmarshal([]byte(row.Rejections), &rejections); err != nil {
			continue // written by this backend; never expected
		}
		reported := map[rumtypes.RejectionReason]*rumtypes.IngestRejection{}
		for _, rejection := range rejections {
			reason := rumtypes.RejectionReason{String: valuer.NewString(rejection.Reason)}
			reported[reason] = &rumtypes.IngestRejection{Reason: reason, Count: rejection.Count, LastOrigin: rejection.LastOrigin, LastSeenAt: rejection.LastSeenAt}
		}
		mergeRejections(byReason, reported)
	}

	rejections := make([]*rumtypes.IngestRejection, 0, len(byReason))
	for _, rejection := range byReason {
		rejections = append(rejections, rejection)
	}
	return counts, sdk, rejections, nil
}

// withReported adds the collectors' reports to what this server's gateway
// saw itself.
func withReported(counts rumtypes.IngestCounts, sdk rumtypes.SeenSDK, rejections []*rumtypes.IngestRejection, reportedCounts rumtypes.IngestCounts, reportedSDK *rumtypes.SeenSDK, reportedRejections []*rumtypes.IngestRejection) (rumtypes.IngestCounts, rumtypes.SeenSDK, []*rumtypes.IngestRejection) {
	counts = addCounts(counts, reportedCounts)
	if sdk.Name == "" && reportedSDK != nil {
		sdk = *reportedSDK
	}

	byReason := map[rumtypes.RejectionReason]*rumtypes.IngestRejection{}
	for _, list := range [][]*rumtypes.IngestRejection{rejections, reportedRejections} {
		from := make(map[rumtypes.RejectionReason]*rumtypes.IngestRejection, len(list))
		for _, rejection := range list {
			from[rejection.Reason] = rejection
		}
		mergeRejections(byReason, from)
	}
	merged := make([]*rumtypes.IngestRejection, 0, len(byReason))
	for _, rejection := range byReason {
		merged = append(merged, rejection)
	}
	slices.SortFunc(merged, func(a, b *rumtypes.IngestRejection) int {
		return b.LastSeenAt.Compare(a.LastSeenAt)
	})
	return counts, sdk, merged
}

func addCounts(a, b rumtypes.IngestCounts) rumtypes.IngestCounts {
	return rumtypes.IngestCounts{
		Sessions: addCount(a.Sessions, b.Sessions),
		Views:    addCount(a.Views, b.Views),
		Errors:   addCount(a.Errors, b.Errors),
		Vitals:   addCount(a.Vitals, b.Vitals),
	}
}
