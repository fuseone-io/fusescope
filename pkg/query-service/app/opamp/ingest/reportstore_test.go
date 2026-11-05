package ingest

import (
	"context"
	"errors"
	"fmt"
	"math"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/fuseone-io/fusescope-collector-server/components/pkg/ingestreport"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/uptrace/bun"

	"github.com/fuseone-io/fusescope/pkg/modules/rumapplication"
	"github.com/fuseone-io/fusescope/pkg/sqlstore"
	"github.com/fuseone-io/fusescope/pkg/types/ingesttypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
)

const (
	appA = "0191c5e2-7f0a-7c3e-9a51-3c2b1d4e5f60"
	appB = "0191c5e2-7f0a-7c3e-9a51-3c2b1d4e5f61"
	keyA = "0191c5e2-8a1b-7d2e-b0c4-5e6f7a8b9c0d"
)

// fakeUsage records the durable values applied, and fails when told to;
// every application exists but those in unknown.
type fakeUsage struct {
	mu      sync.Mutex
	calls   []*rumapplication.IngestUsage
	err     error
	unknown map[valuer.UUID]bool
}

func (f *fakeUsage) KnownApplications(_ context.Context, ids []valuer.UUID) (map[valuer.UUID]bool, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	known := map[valuer.UUID]bool{}
	for _, id := range ids {
		known[id] = !f.unknown[id]
	}
	return known, nil
}

func (f *fakeUsage) RecordIngestUsage(_ context.Context, usage *rumapplication.IngestUsage) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.err != nil {
		return f.err
	}
	f.calls = append(f.calls, usage)
	return nil
}

func (f *fakeUsage) last() *rumapplication.IngestUsage {
	f.mu.Lock()
	defer f.mu.Unlock()
	if len(f.calls) == 0 {
		return nil
	}
	return f.calls[len(f.calls)-1]
}

func testReport(seq uint64, apps ...ingestreport.ApplicationReport) *ingestreport.Report {
	return &ingestreport.Report{
		SchemaVersion: 1, ReportSequence: seq, Page: 1, Pages: 1,
		GeneratedAt: "2026-11-03T12:01:00Z", WindowSeconds: 300,
		Policy:       ingestreport.PolicyReport{Version: 1, Status: "ok"},
		Applications: apps,
		Keys:         []ingestreport.KeyReport{},
	}
}

func activeApp(id string, sessions int64) ingestreport.ApplicationReport {
	return ingestreport.ApplicationReport{ID: id, Counts: ingestreport.Counts{Sessions: sessions, Views: 2 * sessions}, Rejections: []ingestreport.RejectionReport{}}
}

func windowRows(t *testing.T, store sqlstore.SQLStore, agent string) map[string]*ingesttypes.StorableReportApplication {
	t.Helper()
	rows := []*ingesttypes.StorableReportApplication{}
	require.NoError(t, store.BunDB().NewSelect().Model(&rows).Where("agent_id = ?", agent).Scan(context.Background()))
	byApp := map[string]*ingesttypes.StorableReportApplication{}
	for _, row := range rows {
		byApp[row.ApplicationID] = row
	}
	return byApp
}

// The compare-and-apply of §10.4: a sequence applies once, only above both
// the applied and the invalidated one, and its one answer says which.
func TestReportStoreCompareAndApply(t *testing.T) {
	forEachStore(t, func(t *testing.T, newStore func(*testing.T) sqlstore.SQLStore) {
		ctx := context.Background()
		store := NewReportStore(newStore(t), &fakeUsage{})

		record, err := store.Record(ctx, "agent")
		require.NoError(t, err)
		assert.Zero(t, record, "an unknown agent has applied and invalidated nothing")

		steps := []struct {
			name   string
			seq    uint64
			want   ingestreport.ApplyResult
			record ingestreport.AgentRecord
		}{
			{"first", 2, ingestreport.Applied, ingestreport.AgentRecord{Applied: 2}},
			{"again", 2, ingestreport.AlreadyApplied, ingestreport.AgentRecord{Applied: 2}},
			{"lower", 1, ingestreport.AlreadyApplied, ingestreport.AgentRecord{Applied: 2}},
			{"higher", 3, ingestreport.Applied, ingestreport.AgentRecord{Applied: 3}},
		}
		for _, step := range steps {
			got, err := store.ApplyIfGreater(ctx, "agent", testReport(step.seq))
			require.NoError(t, err, step.name)
			assert.Equal(t, step.want, got, step.name)
			record, err := store.Record(ctx, "agent")
			require.NoError(t, err)
			assert.Equal(t, step.record, record, step.name)
		}

		require.NoError(t, store.Invalidate(ctx, "agent", 5))
		require.NoError(t, store.Invalidate(ctx, "agent", 4), "a lower invalidation changes nothing")
		record, err = store.Record(ctx, "agent")
		require.NoError(t, err)
		assert.Equal(t, ingestreport.AgentRecord{Applied: 3, Invalidated: 5}, record)
		for _, seq := range []uint64{4, 5} {
			got, err := store.ApplyIfGreater(ctx, "agent", testReport(seq))
			require.NoError(t, err)
			assert.Equal(t, ingestreport.Invalidated, got, "sequence %d is not above the invalidated one", seq)
		}
		got, err := store.ApplyIfGreater(ctx, "agent", testReport(6))
		require.NoError(t, err)
		assert.Equal(t, ingestreport.Applied, got)

		got, err = store.ApplyIfGreater(ctx, "other", testReport(math.MaxInt64+1))
		require.NoError(t, err)
		assert.Equal(t, ingestreport.Invalidated, got, "a sequence above the largest int64 is never applied")
		require.NoError(t, store.Invalidate(ctx, "other", math.MaxUint64))
		record, err = store.Record(ctx, "other")
		require.NoError(t, err)
		assert.Equal(t, ingestreport.AgentRecord{Invalidated: math.MaxInt64}, record)
		got, err = store.ApplyIfGreater(ctx, "other", testReport(math.MaxInt64))
		require.NoError(t, err)
		assert.Equal(t, ingestreport.Invalidated, got)
	})
}

// Each report replaces its agent's window values and leaves the other
// agents'; an application with nothing in the window is not kept.
func TestReportStoreWindowValues(t *testing.T) {
	forEachStore(t, func(t *testing.T, newStore func(*testing.T) sqlstore.SQLStore) {
		ctx := context.Background()
		db := newStore(t)
		usage := &fakeUsage{}
		store := NewReportStore(db, usage)

		idle := ingestreport.ApplicationReport{ID: appB, FirstSeenAt: "2026-11-03T11:58:12Z", Rejections: []ingestreport.RejectionReport{}}
		_, err := store.ApplyIfGreater(ctx, "one", testReport(1, activeApp(appA, 3), idle))
		require.NoError(t, err)
		assert.Equal(t, time.Date(2026, 11, 3, 11, 58, 12, 0, time.UTC), usage.last().FirstSeen[valuer.MustNewUUID(appB)], "the idle application's first-seen time is applied")
		_, err = store.ApplyIfGreater(ctx, "two", testReport(1, activeApp(appA, 5)))
		require.NoError(t, err)

		rows := windowRows(t, db, "one")
		require.Len(t, rows, 1, "the idle application keeps no window row")
		assert.Equal(t, int64(3), rows[appA].Sessions)
		assert.Equal(t, int64(6), rows[appA].Views)
		assert.Equal(t, "[]", rows[appA].Rejections)

		_, err = store.ApplyIfGreater(ctx, "one", testReport(2, activeApp(appB, 1)))
		require.NoError(t, err)
		rows = windowRows(t, db, "one")
		require.Len(t, rows, 1)
		assert.Contains(t, rows, appB, "the newer report replaces the agent's rows")
		assert.Equal(t, int64(5), windowRows(t, db, "two")[appA].Sessions, "another agent's rows stay")

		_, err = store.ApplyIfGreater(ctx, "one", testReport(2, activeApp(appA, 9)))
		require.NoError(t, err)
		assert.Contains(t, windowRows(t, db, "one"), appB, "a report already applied changes nothing")
	})
}

// A report whose durable values cannot be written is not recorded as
// applied, and its window values are not kept: one transaction.
func TestReportStoreApplyIsAtomic(t *testing.T) {
	forEachStore(t, func(t *testing.T, newStore func(*testing.T) sqlstore.SQLStore) {
		ctx := context.Background()
		db := newStore(t)
		usage := &fakeUsage{}
		store := NewReportStore(db, usage)
		_, err := store.ApplyIfGreater(ctx, "agent", testReport(1, activeApp(appA, 1)))
		require.NoError(t, err)

		usage.err = errors.New("down")
		_, err = store.ApplyIfGreater(ctx, "agent", testReport(2, activeApp(appB, 1)))
		require.Error(t, err)
		record, err := store.Record(ctx, "agent")
		require.NoError(t, err)
		assert.Equal(t, uint64(1), record.Applied)
		assert.Contains(t, windowRows(t, db, "agent"), appA, "the previous report's rows stay")

		usage.err = nil
		got, err := store.ApplyIfGreater(ctx, "agent", testReport(2, activeApp(appB, 1)))
		require.NoError(t, err)
		assert.Equal(t, ingestreport.Applied, got, "the same sequence applies once the store is back")
	})
}

// Replicas commit concurrently: whatever the order, the record ends at the
// highest sequence, and no sequence applies after a higher one. Each round
// is a new store, whose agent record the first commits race to create: a
// commit that missed a record another had not committed yet took the higher
// sequence for invalidated, so the rounds repeat to catch it.
func TestReportStoreConcurrentApply(t *testing.T) {
	forEachStore(t, func(t *testing.T, newStore func(*testing.T) sqlstore.SQLStore) {
		ctx := context.Background()
		for round := range 20 {
			// A subtest per round, so each store's connections close with it.
			t.Run(fmt.Sprintf("round%d", round), func(t *testing.T) {
				db := newStore(t)
				store := NewReportStore(db, &fakeUsage{})
				var mu sync.Mutex
				var applied []uint64
				var wg sync.WaitGroup
				for seq := uint64(1); seq <= 12; seq++ {
					wg.Add(1)
					go func() {
						defer wg.Done()
						got, err := store.ApplyIfGreater(ctx, "agent", testReport(seq, activeApp(appA, int64(seq))))
						assert.NoError(t, err)
						assert.NotEqual(t, ingestreport.Invalidated, got, "sequence %d is never invalidated", seq)
						if got == ingestreport.Applied {
							mu.Lock()
							applied = append(applied, seq)
							mu.Unlock()
						}
					}()
				}
				wg.Wait()
				record, err := store.Record(ctx, "agent")
				require.NoError(t, err)
				assert.Equal(t, uint64(12), record.Applied)
				assert.IsIncreasing(t, applied, "applied in order of commit, each above the last")
				assert.Equal(t, int64(12), windowRows(t, db, "agent")[appA].Sessions, "the rows are the highest sequence's")
			})
		}
	})
}

func TestReportStorePrune(t *testing.T) {
	forEachStore(t, func(t *testing.T, newStore func(*testing.T) sqlstore.SQLStore) {
		ctx := context.Background()
		db := newStore(t)
		store := NewReportStore(db, &fakeUsage{})
		for _, agent := range []string{"fresh", "old"} {
			_, err := store.ApplyIfGreater(ctx, agent, testReport(1, activeApp(appA, 1)))
			require.NoError(t, err)
		}
		old := time.Now().Add(-time.Hour)
		_, err := db.BunDB().NewUpdate().Model((*ingesttypes.StorableReportApplication)(nil)).Set("reported_at = ?", old).Where("agent_id = ?", "old").Exec(ctx)
		require.NoError(t, err)
		_, err = db.BunDB().NewUpdate().Model((*ingesttypes.StorableReportAgent)(nil)).Set("updated_at = ?", old.Add(-agentRetention)).Where("agent_id = ?", "old").Exec(ctx)
		require.NoError(t, err)

		require.NoError(t, store.Prune(ctx))
		assert.Empty(t, windowRows(t, db, "old"), "window values outlive the status window no longer")
		assert.Len(t, windowRows(t, db, "fresh"), 1)
		record, err := store.Record(ctx, "old")
		require.NoError(t, err)
		assert.Zero(t, record, "a long silent agent is forgotten")
		record, err = store.Record(ctx, "fresh")
		require.NoError(t, err)
		assert.Equal(t, uint64(1), record.Applied)
	})
}

// The report is minimised at the collector, and the backend keeps only
// what the schema's bounds allow (§10.3, G5).
func TestWindowValuesBounds(t *testing.T) {
	now := time.Date(2026, 11, 3, 12, 0, 0, 0, time.UTC)
	seen := "2026-11-03T11:59:00Z"
	rejection := func(reason, origin string) ingestreport.RejectionReport {
		return ingestreport.RejectionReport{Reason: reason, Count: 1, LastOrigin: origin, LastSeenAt: seen}
	}
	tests := []struct {
		name string
		app  ingestreport.ApplicationReport
		want func(t *testing.T, rows []ingesttypes.StorableReportApplication)
	}{
		{"not a uuid", ingestreport.ApplicationReport{ID: "app", Counts: ingestreport.Counts{Views: 1}}, func(t *testing.T, rows []ingesttypes.StorableReportApplication) {
			assert.Empty(t, rows)
		}},
		{"sdk at the bounds", ingestreport.ApplicationReport{ID: appA, SDK: ingestreport.SDKReport{Name: "@fusescope/browser", Version: "0.2.0"}}, func(t *testing.T, rows []ingesttypes.StorableReportApplication) {
			assert.Equal(t, "@fusescope/browser", rows[0].SDKName)
			assert.Equal(t, "0.2.0", rows[0].SDKVersion)
		}},
		{"sdk name too long", ingestreport.ApplicationReport{ID: appA, Counts: ingestreport.Counts{Views: 1}, SDK: ingestreport.SDKReport{Name: string(make([]rune, 65)), Version: "1"}}, func(t *testing.T, rows []ingesttypes.StorableReportApplication) {
			assert.Empty(t, rows[0].SDKName)
			assert.Empty(t, rows[0].SDKVersion)
		}},
		{"sdk with a control character", ingestreport.ApplicationReport{ID: appA, Counts: ingestreport.Counts{Views: 1}, SDK: ingestreport.SDKReport{Name: "sdk\n", Version: "1"}}, func(t *testing.T, rows []ingesttypes.StorableReportApplication) {
			assert.Empty(t, rows[0].SDKName)
		}},
		{"origins and packages", ingestreport.ApplicationReport{ID: appA, Rejections: []ingestreport.RejectionReport{
			rejection("origin_not_allowed", "https://staging.example.com:8443"),
			rejection("package_not_allowed", "com.example.shop"),
			rejection("bad_key", "https://example.com"),
			rejection("bad_key", ""),
			rejection("unknown_key", "https://example.com"),
			rejection("something_else", ""),
		}}, func(t *testing.T, rows []ingesttypes.StorableReportApplication) {
			assert.JSONEq(t, `[
				{"reason":"origin_not_allowed","count":1,"lastOrigin":"https://staging.example.com:8443","lastSeenAt":"2026-11-03T11:59:00Z"},
				{"reason":"package_not_allowed","count":1,"lastOrigin":"com.example.shop","lastSeenAt":"2026-11-03T11:59:00Z"},
				{"reason":"bad_key","count":1,"lastOrigin":"","lastSeenAt":"2026-11-03T11:59:00Z"}
			]`, rows[0].Rejections, "one per known reason, an origin only for its two reasons")
		}},
		{"malformed origins", ingestreport.ApplicationReport{ID: appA, Rejections: []ingestreport.RejectionReport{
			rejection("origin_not_allowed", "https://Example.com"),
		}}, func(t *testing.T, rows []ingesttypes.StorableReportApplication) {
			assert.Contains(t, rows[0].Rejections, `"lastOrigin":""`)
		}},
		{"rejection out of bounds", ingestreport.ApplicationReport{ID: appA, Counts: ingestreport.Counts{Views: 1}, Rejections: []ingestreport.RejectionReport{
			{Reason: "too_large", Count: 0, LastSeenAt: seen},
			{Reason: "rate_limited", Count: 1, LastSeenAt: "yesterday"},
		}}, func(t *testing.T, rows []ingesttypes.StorableReportApplication) {
			assert.Equal(t, "[]", rows[0].Rejections)
		}},
		{"seen in the future", ingestreport.ApplicationReport{ID: appA, Rejections: []ingestreport.RejectionReport{
			{Reason: "too_large", Count: 1, LastSeenAt: "2099-01-01T00:00:00Z"},
		}}, func(t *testing.T, rows []ingesttypes.StorableReportApplication) {
			assert.Contains(t, rows[0].Rejections, `"lastSeenAt":"2026-11-03T12:00:00Z"`, "never after the database's clock")
		}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			test.want(t, windowValues("agent", testReport(1, test.app), now))
		})
	}
}

func TestWellFormedOrigin(t *testing.T) {
	for origin, want := range map[string]bool{
		"https://example.com":       true,
		"http://localhost:3000":     true,
		"https://[::1]:8443":        true,
		"https://Example.com":       false,
		"https://example.com/":      false,
		"https://example.com/path":  false,
		"https://example.com?q=1":   false,
		"https://user@example.com":  false,
		"https://example.com:99999": false,
		"ftp://example.com":         false,
		"example.com":               false,
		"https://exa mple.com":      false,
		"https://exa%20mple.com":    false,
	} {
		assert.Equal(t, want, wellFormedOrigin(origin), origin)
	}
}

// Durable values: the earliest first-seen time, the latest use, never in
// the future, and only for well-formed IDs.
func TestDurableValues(t *testing.T) {
	now := time.Date(2026, 11, 3, 12, 0, 0, 0, time.UTC)
	r := testReport(1,
		ingestreport.ApplicationReport{ID: appA, FirstSeenAt: "2026-11-03T11:00:00Z"},
		ingestreport.ApplicationReport{ID: appB, FirstSeenAt: "2099-01-01T00:00:00Z"},
		ingestreport.ApplicationReport{ID: "app", FirstSeenAt: "2026-11-03T11:00:00Z"},
		ingestreport.ApplicationReport{ID: appA},
	)
	r.Keys = []ingestreport.KeyReport{
		{ID: keyA, LastUsedAt: "2026-11-03T11:59:59.5Z"},
		{ID: "key", LastUsedAt: "2026-11-03T11:59:59Z"},
		{ID: appB, LastUsedAt: "soon"},
		{ID: "0191c5e2-8a1b-7d2e-b0c4-000000000001", LastUsedAt: "0000-01-01T00:00:00Z"},
	}
	usage := durableValues(r, now)
	assert.Equal(t, map[valuer.UUID]time.Time{
		valuer.MustNewUUID(appA): time.Date(2026, 11, 3, 11, 0, 0, 0, time.UTC),
		valuer.MustNewUUID(appB): now,
	}, usage.FirstSeen)
	assert.Equal(t, map[valuer.UUID]time.Time{
		valuer.MustNewUUID(keyA): time.Date(2026, 11, 3, 11, 59, 59, 5e8, time.UTC),
	}, usage.LastUsed)
}

// What the assembler does not check is checked before any write (§10.3):
// a report out of the bounds is invalidated whole and recorded so.
func TestValidReport(t *testing.T) {
	apps := func(n int) []ingestreport.ApplicationReport {
		out := make([]ingestreport.ApplicationReport, n)
		for i := range out {
			out[i] = ingestreport.ApplicationReport{ID: fmt.Sprintf("0191c5e2-7f0a-7c3e-9a51-%012x", i), Rejections: []ingestreport.RejectionReport{}}
		}
		return out
	}
	keys := func(n int) []ingestreport.KeyReport {
		out := make([]ingestreport.KeyReport, n)
		for i := range out {
			out[i] = ingestreport.KeyReport{ID: fmt.Sprintf("0191c5e2-8a1b-7d2e-b0c4-%012x", i), LastUsedAt: "2026-11-03T12:00:00Z"}
		}
		return out
	}
	rejections := func(n int) []ingestreport.RejectionReport {
		out := make([]ingestreport.RejectionReport, n)
		for i := range out {
			out[i] = ingestreport.RejectionReport{Reason: "bad_key", Count: 1, LastSeenAt: "2026-11-03T12:00:00Z"}
		}
		return out
	}
	tests := []struct {
		name   string
		change func(r *ingestreport.Report)
		valid  bool
	}{
		{"at the bounds", func(r *ingestreport.Report) {
			r.Applications, r.Keys = apps(maxReportApplications), keys(maxReportKeys)
			r.Applications[0].Rejections = rejections(maxReportRejections)
		}, true},
		{"rejected with a code", func(r *ingestreport.Report) {
			r.Policy = ingestreport.PolicyReport{Status: "rejected", Error: "persist_error"}
		}, true},
		{"10 001 applications", func(r *ingestreport.Report) { r.Applications = apps(maxReportApplications + 1) }, false},
		{"10 001 keys", func(r *ingestreport.Report) { r.Keys = keys(maxReportKeys + 1) }, false},
		{"8 rejections", func(r *ingestreport.Report) {
			r.Applications = apps(1)
			r.Applications[0].Rejections = rejections(maxReportRejections + 1)
		}, false},
		{"another window", func(r *ingestreport.Report) { r.WindowSeconds = 60 }, false},
		{"unknown status", func(r *ingestreport.Report) { r.Policy.Status = "pending" }, false},
		{"ok with an error", func(r *ingestreport.Report) { r.Policy.Error = "invalid_value" }, false},
		{"rejected without a code", func(r *ingestreport.Report) {
			r.Policy = ingestreport.PolicyReport{Status: "rejected", Error: "SECRET"}
		}, false},
		{"negative count", func(r *ingestreport.Report) { r.Applications = apps(1); r.Applications[0].Counts.Views = -1 }, false},
		{"negative rejection count", func(r *ingestreport.Report) {
			r.Applications = apps(1)
			r.Applications[0].Rejections = []ingestreport.RejectionReport{{Reason: "bad_key", Count: -1}}
		}, false},
		{"negative unknown keys", func(r *ingestreport.Report) { r.UnknownKeys.Count = -1 }, false},
	}
	for _, test := range tests {
		r := testReport(1)
		test.change(r)
		assert.Equal(t, test.valid, validReport(r), test.name)
	}

	forEachStore(t, func(t *testing.T, newStore func(*testing.T) sqlstore.SQLStore) {
		ctx := context.Background()
		db := newStore(t)
		usage := &fakeUsage{}
		store := NewReportStore(db, usage)
		r := testReport(4, apps(maxReportApplications+1)...)
		got, err := store.ApplyIfGreater(ctx, "agent", r)
		require.NoError(t, err)
		assert.Equal(t, ingestreport.Invalidated, got)
		record, err := store.Record(ctx, "agent")
		require.NoError(t, err)
		assert.Equal(t, ingestreport.AgentRecord{Invalidated: 4}, record, "recorded, so its pages are refused")
		assert.Empty(t, windowRows(t, db, "agent"))
		assert.Nil(t, usage.last(), "nothing written")
	})
}

// Only applications that exist are persisted, window values and first data
// alike; a timestamp PostgreSQL cannot hold is dropped, not failed on.
func TestReportStoreKnownApplicationsAndOldTimes(t *testing.T) {
	forEachStore(t, func(t *testing.T, newStore func(*testing.T) sqlstore.SQLStore) {
		ctx := context.Background()
		db := newStore(t)
		usage := &fakeUsage{unknown: map[valuer.UUID]bool{valuer.MustNewUUID(appB): true}}
		store := NewReportStore(db, usage)
		known, unknown := activeApp(appA, 1), activeApp(appB, 1)
		known.FirstSeenAt, unknown.FirstSeenAt = "0000-01-01T00:00:00Z", "2026-11-03T11:00:00Z"
		known.Rejections = []ingestreport.RejectionReport{{Reason: "too_large", Count: 1, LastSeenAt: "0001-01-01T00:00:00Z"}, {Reason: "bad_key", Count: 1, LastSeenAt: "2026-11-03T11:00:00Z"}}
		r := testReport(1, known, unknown)
		r.Keys = []ingestreport.KeyReport{{ID: keyA, LastUsedAt: "0000-01-01T00:00:00Z"}}

		got, err := store.ApplyIfGreater(ctx, "agent", r)
		require.NoError(t, err)
		assert.Equal(t, ingestreport.Applied, got)
		rows := windowRows(t, db, "agent")
		require.Len(t, rows, 1)
		assert.Contains(t, rows, appA, "the unknown application keeps no row")
		assert.NotContains(t, rows[appA].Rejections, "too_large", "a rejection seen before the earliest time is dropped")
		assert.Empty(t, usage.last().FirstSeen, "neither the unknown application nor the year 0")
		assert.Empty(t, usage.last().LastUsed)
	})
}

// A token holder renewing its UID gets at most newAgents records an hour;
// a known agent is never held back by it.
func TestReportStoreNewAgentLimit(t *testing.T) {
	forEachStore(t, func(t *testing.T, newStore func(*testing.T) sqlstore.SQLStore) {
		ctx := context.Background()
		db := newStore(t)
		store := NewReportStore(db, &fakeUsage{})
		_, err := store.ApplyIfGreater(ctx, "known", testReport(1))
		require.NoError(t, err)
		now := time.Now().UTC()
		filler := make([]ingesttypes.StorableReportAgent, newAgents-1)
		for i := range filler {
			filler[i] = ingesttypes.StorableReportAgent{AgentID: fmt.Sprintf("filler-%d", i), CreatedAt: now, UpdatedAt: now}
		}
		_, err = db.BunDB().NewInsert().Model(&filler).Exec(ctx)
		require.NoError(t, err)

		_, err = store.ApplyIfGreater(ctx, "new", testReport(1, activeApp(appA, 1)))
		require.ErrorIs(t, err, errNewAgentLimit)
		require.NoError(t, store.Invalidate(ctx, "new", 2), "an invalidation of an agent past the bound is a no-op")
		record, err := store.Record(ctx, "new")
		require.NoError(t, err)
		assert.Zero(t, record, "no record made")
		assert.Empty(t, windowRows(t, db, "new"))

		got, err := store.ApplyIfGreater(ctx, "known", testReport(2))
		require.NoError(t, err)
		assert.Equal(t, ingestreport.Applied, got)

		_, err = db.BunDB().NewUpdate().Model((*ingesttypes.StorableReportAgent)(nil)).Set("created_at = ?", now.Add(-2*newAgentWindow)).Where("agent_id LIKE 'filler-%'").Exec(ctx)
		require.NoError(t, err)
		got, err = store.ApplyIfGreater(ctx, "new", testReport(1))
		require.NoError(t, err)
		assert.Equal(t, ingestreport.Applied, got, "after the window, a new agent gets a record")
	})
}

// Concurrent new agents, through two replicas' stores, are admitted one at
// a time: the hour never holds more than newAgents records.
func TestReportStoreNewAgentLimitConcurrent(t *testing.T) {
	forEachStore(t, func(t *testing.T, newStore func(*testing.T) sqlstore.SQLStore) {
		ctx := context.Background()
		db := newStore(t)
		replicas := []*ReportStore{NewReportStore(db, &fakeUsage{}), NewReportStore(db, &fakeUsage{})}
		now := time.Now().UTC()
		filler := make([]ingesttypes.StorableReportAgent, newAgents-1)
		for i := range filler {
			filler[i] = ingesttypes.StorableReportAgent{AgentID: fmt.Sprintf("filler-%d", i), CreatedAt: now, UpdatedAt: now}
		}
		_, err := db.BunDB().NewInsert().Model(&filler).Exec(ctx)
		require.NoError(t, err)

		// Each count waits before its transaction goes on, so counts and
		// inserts of concurrent transactions would interleave without the
		// admission lock.
		db.BunDB().AddQueryHook(slowCount{}) //nolint:staticcheck // WithQueryHook returns a copy; the stores hold this DB

		start := make(chan struct{})
		var wg sync.WaitGroup
		var admitted atomic.Int32
		for i := range 20 {
			wg.Add(1)
			go func() {
				defer wg.Done()
				<-start
				got, err := replicas[i%2].ApplyIfGreater(ctx, fmt.Sprintf("new-%d", i), testReport(1))
				if err == nil && got == ingestreport.Applied {
					admitted.Add(1)
				} else if err != nil && !errors.Is(err, errNewAgentLimit) {
					t.Errorf("agent %d: %v", i, err)
				}
			}()
		}
		close(start)
		wg.Wait()
		recent, err := db.BunDB().NewSelect().Model((*ingesttypes.StorableReportAgent)(nil)).Where("created_at > ?", now.Add(-newAgentWindow)).Count(ctx)
		require.NoError(t, err)
		assert.EqualValues(t, newAgents, recent, "exactly the bound, never past it")
		assert.Equal(t, int32(1), admitted.Load())
	})
}

// slowCount delays every statement that counts rows.
type slowCount struct{}

func (slowCount) BeforeQuery(ctx context.Context, _ *bun.QueryEvent) context.Context { return ctx }

func (slowCount) AfterQuery(_ context.Context, event *bun.QueryEvent) {
	if strings.Contains(strings.ToLower(event.Query), "count(") {
		time.Sleep(50 * time.Millisecond)
	}
}

// The admission row is permanent: pruning never deletes it, even when its
// last admission is older than the agents' retention, and pruning that runs
// with the first admissions after it does not break their serialisation.
func TestReportStoreAdmissionRowSurvivesPrune(t *testing.T) {
	forEachStore(t, func(t *testing.T, newStore func(*testing.T) sqlstore.SQLStore) {
		ctx := context.Background()
		db := newStore(t)
		store := NewReportStore(db, &fakeUsage{})
		_, err := store.ApplyIfGreater(ctx, "first", testReport(1))
		require.NoError(t, err)
		old := time.Now().Add(-2 * agentRetention)
		_, err = db.BunDB().NewUpdate().Model((*ingesttypes.StorableReportAgent)(nil)).Set("updated_at = ?", old).Where("agent_id = ?", admissionRow).Exec(ctx)
		require.NoError(t, err)
		require.NoError(t, store.Prune(ctx))
		exists, err := db.BunDB().NewSelect().Model((*ingesttypes.StorableReportAgent)(nil)).Where("agent_id = ?", admissionRow).Exists(ctx)
		require.NoError(t, err)
		require.True(t, exists, "pruning keeps the admission row")

		now := time.Now().UTC()
		filler := make([]ingesttypes.StorableReportAgent, newAgents-2)
		for i := range filler {
			filler[i] = ingesttypes.StorableReportAgent{AgentID: fmt.Sprintf("filler-%d", i), CreatedAt: now, UpdatedAt: now}
		}
		_, err = db.BunDB().NewInsert().Model(&filler).Exec(ctx)
		require.NoError(t, err)
		_, err = db.BunDB().NewUpdate().Model((*ingesttypes.StorableReportAgent)(nil)).Set("updated_at = ?", old).Where("agent_id = ?", admissionRow).Exec(ctx)
		require.NoError(t, err)
		db.BunDB().AddQueryHook(slowCount{}) //nolint:staticcheck // WithQueryHook returns a copy; the store holds this DB

		stop := make(chan struct{})
		pruned := make(chan struct{})
		go func() {
			defer close(pruned)
			for {
				select {
				case <-stop:
					return
				default:
					_ = store.Prune(ctx)
				}
			}
		}()
		var wg sync.WaitGroup
		for i := range 20 {
			wg.Add(1)
			go func() {
				defer wg.Done()
				_, err := store.ApplyIfGreater(ctx, fmt.Sprintf("new-%d", i), testReport(1))
				if err != nil && !errors.Is(err, errNewAgentLimit) {
					t.Errorf("agent %d: %v", i, err)
				}
			}()
		}
		wg.Wait()
		close(stop)
		<-pruned
		recent, err := db.BunDB().NewSelect().Model((*ingesttypes.StorableReportAgent)(nil)).Where("created_at > ?", now.Add(-newAgentWindow)).Count(ctx)
		require.NoError(t, err)
		assert.EqualValues(t, newAgents, recent, "exactly the bound, never past it")
	})
}
