package implrumapplication

import (
	"context"
	"math"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/uptrace/bun"

	"github.com/fuseone-io/fusescope/pkg/modules/rumapplication"
	"github.com/fuseone-io/fusescope/pkg/types/ingesttypes"
	"github.com/fuseone-io/fusescope/pkg/types/rumtypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
)

// Reports from several collectors, in any order, keep the earliest first
// data and the latest use; an unknown ID changes nothing.
func TestModuleRecordIngestUsage(t *testing.T) {
	ctx := context.Background()
	module, orgID := newTestModule(t)
	created, err := module.Create(ctx, orgID, "admin@example.com", newTestPostable(t, `{"name":"web","platform":"web","environment":"production"}`))
	require.NoError(t, err)
	early := time.Date(2026, 11, 3, 11, 0, 0, 0, time.UTC)
	late := early.Add(time.Hour)
	unknown := valuer.GenerateUUID()

	for _, at := range []time.Time{late, early, late} {
		require.NoError(t, module.RecordIngestUsage(ctx, &rumapplication.IngestUsage{
			FirstSeen: map[valuer.UUID]time.Time{created.ID: at, unknown: at},
			LastUsed:  map[valuer.UUID]time.Time{created.Key.ID: at, unknown: at},
		}))
	}
	require.NoError(t, module.RecordIngestUsage(ctx, &rumapplication.IngestUsage{LastUsed: map[valuer.UUID]time.Time{created.Key.ID: early}}))

	stored, err := module.Get(ctx, orgID, created.ID)
	require.NoError(t, err)
	require.NotNil(t, stored.FirstSeenAt)
	assert.True(t, early.Equal(*stored.FirstSeenAt), "the earliest first data, got %s", stored.FirstSeenAt)
	keys, err := module.ListKeys(ctx, orgID, created.ID)
	require.NoError(t, err)
	require.Len(t, keys, 1)
	require.NotNil(t, keys[0].LastUsedAt)
	assert.True(t, late.Equal(*keys[0].LastUsedAt), "the latest use, got %s", keys[0].LastUsedAt)
}

// The setup status sums the latest report of every collector with what
// this server's gateway saw: counts add up, rejections merge by reason
// with the newest origin, and a stale report counts no more.
func TestModuleStatusSumsReports(t *testing.T) {
	ctx := context.Background()
	module, orgID := newTestModule(t)
	created, err := module.Create(ctx, orgID, "admin@example.com", newTestPostable(t, `{"name":"web","platform":"web","environment":"production"}`))
	require.NoError(t, err)
	now, err := module.store.DatabaseNow(ctx)
	require.NoError(t, err)

	rows := []ingesttypes.StorableReportApplication{
		{
			ApplicationID: created.ID.StringValue(), AgentID: "one", Sessions: 2, Views: 5, Errors: 1, Vitals: 3,
			SDKName: "@fusescope/browser", SDKVersion: "0.1.0", ReportedAt: now.Add(-90 * time.Second),
			Rejections: `[{"reason":"origin_not_allowed","count":2,"lastOrigin":"https://a.example.com","lastSeenAt":"2026-11-03T12:00:00Z"}]`,
		},
		{
			ApplicationID: created.ID.StringValue(), AgentID: "two", Sessions: 1, Views: 1, ReportedAt: now.Add(-30 * time.Second),
			SDKName: "@fusescope/browser", SDKVersion: "0.2.0",
			Rejections: `[{"reason":"origin_not_allowed","count":1,"lastOrigin":"https://b.example.com","lastSeenAt":"2026-11-03T12:01:00Z"},{"reason":"signal_not_allowed","count":4,"lastOrigin":"","lastSeenAt":"2026-11-03T11:59:00Z"}]`,
		},
		{ApplicationID: created.ID.StringValue(), AgentID: "gone", Sessions: 100, ReportedAt: now.Add(-reportFreshness - time.Second), Rejections: `[]`},
		{ApplicationID: valuer.GenerateUUID().StringValue(), AgentID: "one", Sessions: 7, ReportedAt: now, Rejections: `[]`},
	}
	_, err = module.store.(*store).sqlstore.BunDB().NewInsert().Model(&rows).Exec(ctx)
	require.NoError(t, err)

	application, keyID, err := module.Authenticate(ctx, created.Key.Key)
	require.NoError(t, err)
	module.ObserveIngest(application, keyID, &rumtypes.IngestBatch{SessionIDs: []string{"s"}, Views: 1})
	module.ObserveRejection(created.ID, rumtypes.RejectionReasonTooLarge, "https://shop.example.com")

	status, err := module.Status(ctx, orgID, created.ID)
	require.NoError(t, err)
	assert.Equal(t, rumtypes.IngestCounts{Sessions: 4, Views: 7, Errors: 1, Vitals: 3}, status.Counts)
	assert.Equal(t, "0.2.0", status.SDK.Version, "the newest report's SDK")
	byReason := map[rumtypes.RejectionReason]*rumtypes.IngestRejection{}
	for _, rejection := range status.Rejections {
		byReason[rejection.Reason] = rejection
	}
	require.Len(t, byReason, 3)
	assert.Equal(t, int64(3), byReason[rumtypes.RejectionReasonOriginNotAllowed].Count)
	assert.Equal(t, "https://b.example.com", byReason[rumtypes.RejectionReasonOriginNotAllowed].LastOrigin, "the newest origin")
	assert.Equal(t, int64(4), byReason[rumtypes.RejectionReasonSignalNotAllowed].Count)
	assert.Equal(t, int64(1), byReason[rumtypes.RejectionReasonTooLarge].Count, "this server's own gateway")
	assert.Equal(t, rumtypes.RejectionReasonTooLarge, status.Rejections[0].Reason, "newest first")
}

// queryCounter counts the statements a bun.DB runs.
type queryCounter struct{ n atomic.Int64 }

func (c *queryCounter) BeforeQuery(ctx context.Context, _ *bun.QueryEvent) context.Context {
	c.n.Add(1)
	return ctx
}

func (c *queryCounter) AfterQuery(context.Context, *bun.QueryEvent) {}

// A report at the bounds, 10 000 applications and 10 000 keys, is written
// in a few statements per batch of usageBatch, not one per row, so its
// commit fits the store call's deadline.
func TestModuleRecordIngestUsageInBatches(t *testing.T) {
	ctx := context.Background()
	module, orgID := newTestModule(t)
	created, err := module.Create(ctx, orgID, "admin@example.com", newTestPostable(t, `{"name":"web","platform":"web","environment":"production"}`))
	require.NoError(t, err)
	at := time.Date(2026, 11, 3, 11, 0, 0, 0, time.UTC)
	usage := &rumapplication.IngestUsage{FirstSeen: map[valuer.UUID]time.Time{created.ID: at}, LastUsed: map[valuer.UUID]time.Time{created.Key.ID: at}}
	for range 9999 {
		usage.FirstSeen[valuer.GenerateUUID()] = at
		usage.LastUsed[valuer.GenerateUUID()] = at
	}
	counter := &queryCounter{}
	module.store.(*store).sqlstore.BunDB().AddQueryHook(counter) //nolint:staticcheck // WithQueryHook returns a copy; the module holds this DB

	require.NoError(t, module.RecordIngestUsage(ctx, usage))
	assert.LessOrEqual(t, counter.n.Load(), int64(2*(10000+usageBatch-1)/usageBatch), "one statement per batch")
	stored, err := module.Get(ctx, orgID, created.ID)
	require.NoError(t, err)
	assert.True(t, at.Equal(*stored.FirstSeenAt))
	keys, err := module.ListKeys(ctx, orgID, created.ID)
	require.NoError(t, err)
	assert.True(t, at.Equal(*keys[0].LastUsedAt))

	ids := make([]valuer.UUID, 0, len(usage.FirstSeen))
	for id := range usage.FirstSeen {
		ids = append(ids, id)
	}
	known, err := module.KnownApplications(ctx, ids)
	require.NoError(t, err)
	assert.Equal(t, map[valuer.UUID]bool{created.ID: true}, known)
}

// Counts at int64's bound from several collectors and the gateway saturate
// rather than wrap negative.
func TestModuleStatusSaturates(t *testing.T) {
	ctx := context.Background()
	module, orgID := newTestModule(t)
	created, err := module.Create(ctx, orgID, "admin@example.com", newTestPostable(t, `{"name":"web","platform":"web","environment":"production"}`))
	require.NoError(t, err)
	now, err := module.store.DatabaseNow(ctx)
	require.NoError(t, err)
	rejection := `[{"reason":"bad_key","count":9223372036854775807,"lastOrigin":"","lastSeenAt":"2026-11-03T12:00:00Z"}]`
	rows := []ingesttypes.StorableReportApplication{
		{ApplicationID: created.ID.StringValue(), AgentID: "one", Views: math.MaxInt64, Sessions: math.MaxInt64, ReportedAt: now, Rejections: rejection},
		{ApplicationID: created.ID.StringValue(), AgentID: "two", Views: math.MaxInt64, Sessions: math.MaxInt64, ReportedAt: now, Rejections: rejection},
	}
	_, err = module.store.(*store).sqlstore.BunDB().NewInsert().Model(&rows).Exec(ctx)
	require.NoError(t, err)
	application, keyID, err := module.Authenticate(ctx, created.Key.Key)
	require.NoError(t, err)
	module.ObserveIngest(application, keyID, &rumtypes.IngestBatch{SessionIDs: []string{"s"}, Views: 1})
	module.ObserveRejection(created.ID, rumtypes.RejectionReasonBadKey, "")

	status, err := module.Status(ctx, orgID, created.ID)
	require.NoError(t, err)
	assert.Equal(t, int64(math.MaxInt64), status.Counts.Views)
	assert.Equal(t, int64(math.MaxInt64), status.Counts.Sessions)
	require.Len(t, status.Rejections, 1)
	assert.Equal(t, int64(math.MaxInt64), status.Rejections[0].Count)
}
