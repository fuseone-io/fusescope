package ingest

import (
	"context"
	"database/sql"
	"encoding/json"
	"maps"
	"math"
	"net/url"
	"slices"
	"strconv"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/fuseone-io/fusescope-collector-server/components/pkg/ingestpolicy"
	"github.com/fuseone-io/fusescope-collector-server/components/pkg/ingestreport"
	"github.com/uptrace/bun"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/modules/rumapplication"
	"github.com/fuseone-io/fusescope/pkg/sqlstore"
	"github.com/fuseone-io/fusescope/pkg/types/ingesttypes"
	"github.com/fuseone-io/fusescope/pkg/types/rumtypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
)

const (
	// agentRetention is how long an agent's record outlives its last
	// report. A record deleted earlier would let a replayed report of that
	// agent apply again; its durable values only ever move the same way.
	agentRetention = 30 * 24 * time.Hour
	// insertBatch bounds the rows of one INSERT, within either dialect's
	// limit of bound parameters.
	insertBatch = 500

	// newAgents agents may get a record per newAgentWindow, so a token
	// holder renewing its UID cannot grow the records without bound; a
	// report of an agent over it is not applied yet, and its collector sends
	// the values again.
	newAgents      = maxAgents
	newAgentWindow = time.Hour

	// Bounds of a report (§10.3): every application of the policy, every
	// pending key (limits.pending_keys, §7.1), one rejection per reason.
	maxReportApplications = ingestpolicy.MaxApplications
	maxReportKeys         = 10000
	maxReportRejections   = 7

	maxSDKName    = 64
	maxSDKVersion = 32
	maxLastOrigin = 256
)

// earliestReported is the earliest time a report may carry; an earlier one
// is dropped. Go parses the year 0, which PostgreSQL's timestamp refuses,
// and a value that fails every commit would hold back every report.
var earliestReported = time.Date(2020, 1, 1, 0, 0, 0, 0, time.UTC)

// errNewAgentLimit is a report of an agent past the newAgents bound.
var errNewAgentLimit = errors.New(errors.TypeTooManyRequests, errors.CodeInternal, "too many new ingest report agents; the report is applied later")

// policyCodes are the codes a rejected policy may report (§11.2).
var policyCodes = func() map[string]bool {
	codes := map[string]bool{}
	for _, code := range ingestpolicy.Codes {
		codes[string(code)] = true
	}
	return codes
}()

// reportReasons are the per-application rejection reasons of a report
// (the collector's docs/spec/rum.md §10.1); unknown keys are global.
var reportReasons = map[string]bool{
	rumtypes.RejectionReasonBadKey.StringValue():            true,
	rumtypes.RejectionReasonOriginNotAllowed.StringValue():  true,
	rumtypes.RejectionReasonPackageNotAllowed.StringValue(): true,
	rumtypes.RejectionReasonRateLimited.StringValue():       true,
	rumtypes.RejectionReasonTooLarge.StringValue():          true,
	rumtypes.RejectionReasonInvalidPayload.StringValue():    true,
	rumtypes.RejectionReasonSignalNotAllowed.StringValue():  true,
}

// Usage persists a report's durable values in the caller's transaction, and
// says which applications exist: no other is persisted.
type Usage interface {
	RecordIngestUsage(ctx context.Context, usage *rumapplication.IngestUsage) error
	KnownApplications(ctx context.Context, ids []valuer.UUID) (map[valuer.UUID]bool, error)
}

// ReportStore is the assembler's AgentStore on the backend's database
// (§10.4): the per-agent record, and in the same transaction as recording
// a sequence applied, the report's window values and durable values.
type ReportStore struct {
	store sqlstore.SQLStore
	usage Usage
}

var _ ingestreport.AgentStore = (*ReportStore)(nil)

func NewReportStore(store sqlstore.SQLStore, usage Usage) *ReportStore {
	return &ReportStore{store: store, usage: usage}
}

func (s *ReportStore) Record(ctx context.Context, agent string) (ingestreport.AgentRecord, error) {
	row := new(ingesttypes.StorableReportAgent)
	err := s.store.BunDBCtx(ctx).NewSelect().Model(row).Where("agent_id = ?", agent).Scan(ctx)
	if errors.Is(err, sql.ErrNoRows) {
		return ingestreport.AgentRecord{}, nil
	}
	if err != nil {
		return ingestreport.AgentRecord{}, errors.WrapInternalf(err, errors.CodeInternal, "failed to read the ingest report agent")
	}
	return ingestreport.AgentRecord{Applied: uint64(row.Applied), Invalidated: uint64(row.Invalidated)}, nil
}

// ApplyIfGreater is the compare-and-apply: one conditional update of the
// agent's record decides, under the row's lock, and the report is applied
// in the same transaction only if it raised the applied sequence.
func (s *ReportStore) ApplyIfGreater(ctx context.Context, agent string, r *ingestreport.Report) (ingestreport.ApplyResult, error) {
	if r.ReportSequence > math.MaxInt64 {
		return ingestreport.Invalidated, nil
	}
	if !validReport(r) {
		// Recorded, so the sequence is refused before its pages are held.
		if err := s.Invalidate(ctx, agent, r.ReportSequence); err != nil {
			return 0, err
		}
		return ingestreport.Invalidated, nil
	}
	seq := int64(r.ReportSequence)
	var result ingestreport.ApplyResult
	err := s.store.RunInTxCtx(ctx, nil, func(ctx context.Context) error {
		db := s.store.BunDBCtx(ctx)
		now, err := ingesttypes.DatabaseNow(ctx, db)
		if err != nil {
			return err
		}
		updated, exists, err := s.raise(ctx, agent, now, func(q *bun.UpdateQuery) *bun.UpdateQuery {
			return q.Set("applied = ?", seq).Where("applied < ?", seq).Where("invalidated < ?", seq)
		})
		if err != nil {
			return err
		}
		if !exists {
			return errNewAgentLimit
		}
		if !updated {
			row := new(ingesttypes.StorableReportAgent)
			if err := db.NewSelect().Model(row).Where("agent_id = ?", agent).Scan(ctx); err != nil {
				return err
			}
			result = ingestreport.Invalidated
			if row.Applied >= seq {
				result = ingestreport.AlreadyApplied
			}
			return nil
		}
		usage := durableValues(r, now)
		rows := windowValues(agent, r, now)
		known, err := s.knownApplications(ctx, rows, usage)
		if err != nil {
			return err
		}
		maps.DeleteFunc(usage.FirstSeen, func(id valuer.UUID, _ time.Time) bool { return !known[id] })
		rows = slices.DeleteFunc(rows, func(row ingesttypes.StorableReportApplication) bool {
			return !known[valuer.MustNewUUID(row.ApplicationID)]
		})
		if err := s.applyWindow(ctx, agent, rows); err != nil {
			return err
		}
		if err := s.usage.RecordIngestUsage(ctx, usage); err != nil {
			return err
		}
		result = ingestreport.Applied
		return nil
	})
	if errors.Is(err, errNewAgentLimit) {
		return 0, err
	}
	if err != nil {
		return 0, errors.WrapInternalf(err, errors.CodeInternal, "failed to apply the ingest report")
	}
	return result, nil
}

// knownApplications is which applications of the report exist.
func (s *ReportStore) knownApplications(ctx context.Context, rows []ingesttypes.StorableReportApplication, usage *rumapplication.IngestUsage) (map[valuer.UUID]bool, error) {
	ids := make([]valuer.UUID, 0, len(rows)+len(usage.FirstSeen))
	for _, row := range rows {
		ids = append(ids, valuer.MustNewUUID(row.ApplicationID))
	}
	for id := range usage.FirstSeen {
		ids = append(ids, id)
	}
	slices.SortFunc(ids, func(a, b valuer.UUID) int { return strings.Compare(a.StringValue(), b.StringValue()) })
	return s.usage.KnownApplications(ctx, slices.Compact(ids))
}

// validReport checks what the assembler does not (§10.3): the window, the
// policy's status, and the bounds of the lists and counts. A report out of
// them is invalidated whole, never applied in part.
func validReport(r *ingestreport.Report) bool {
	if r.WindowSeconds != int(rumtypes.StatusWindow.Seconds()) || len(r.Applications) > maxReportApplications || len(r.Keys) > maxReportKeys {
		return false
	}
	switch r.Policy.Status {
	case "ok":
		if r.Policy.Error != "" {
			return false
		}
	case "rejected":
		if !policyCodes[r.Policy.Error] {
			return false
		}
	default:
		return false
	}
	if r.UnknownKeys.Count < 0 {
		return false
	}
	for i := range r.Applications {
		app := &r.Applications[i]
		c := app.Counts
		if c.Sessions < 0 || c.Views < 0 || c.Errors < 0 || c.Vitals < 0 || len(app.Rejections) > maxReportRejections {
			return false
		}
		for _, rejection := range app.Rejections {
			if rejection.Count < 0 {
				return false
			}
		}
	}
	return true
}

// Invalidate raises the agent's invalidated sequence to seq; one above the
// largest int64 raises it to that, which refuses every sequence above. An
// agent past the newAgents bound gets no record: nothing was applied for
// it, so its invalid sequence is only refused again when resent.
func (s *ReportStore) Invalidate(ctx context.Context, agent string, seq uint64) error {
	stored := int64(min(seq, math.MaxInt64))
	err := s.store.RunInTxCtx(ctx, nil, func(ctx context.Context) error {
		db := s.store.BunDBCtx(ctx)
		now, err := ingesttypes.DatabaseNow(ctx, db)
		if err != nil {
			return err
		}
		_, _, err = s.raise(ctx, agent, now, func(q *bun.UpdateQuery) *bun.UpdateQuery {
			return q.Set("invalidated = ?", stored).Where("invalidated < ?", stored)
		})
		return err
	})
	if err != nil {
		return errors.WrapInternalf(err, errors.CodeInternal, "failed to invalidate the ingest report")
	}
	return nil
}

// Prune deletes window values older than the status window, so origins and
// SDK strings are kept no longer (§10.3), and records of agents silent for
// agentRetention.
func (s *ReportStore) Prune(ctx context.Context) error {
	db := s.store.BunDBCtx(ctx)
	now, err := ingesttypes.DatabaseNow(ctx, db)
	if err == nil {
		_, err = db.NewDelete().Model((*ingesttypes.StorableReportApplication)(nil)).Where("reported_at < ?", now.Add(-rumtypes.StatusWindow)).Exec(ctx)
	}
	if err == nil {
		_, err = db.NewDelete().Model((*ingesttypes.StorableReportAgent)(nil)).Where("updated_at < ?", now.Add(-agentRetention)).Exec(ctx)
	}
	if err != nil {
		return errors.WrapInternalf(err, errors.CodeInternal, "failed to prune ingest reports")
	}
	return nil
}

// raise runs the conditional update of the agent's record and reports
// whether it updated it and whether the record exists. The update comes
// first, so it takes the row's lock (and SQLite's write lock: a read first
// would have to be upgraded, which fails under concurrent writers). With no
// record, one is made, within newAgents, and the update runs again.
func (s *ReportStore) raise(ctx context.Context, agent string, now time.Time, update func(*bun.UpdateQuery) *bun.UpdateQuery) (updated, exists bool, err error) {
	db := s.store.BunDBCtx(ctx)
	run := func() (bool, error) {
		res, err := update(db.NewUpdate().Model((*ingesttypes.StorableReportAgent)(nil)).Set("updated_at = ?", now).Where("agent_id = ?", agent)).Exec(ctx)
		if err != nil {
			return false, err
		}
		rows, err := res.RowsAffected()
		return rows > 0, err
	}
	if updated, err = run(); err != nil || updated {
		return updated, true, err
	}
	if exists, err = db.NewSelect().Model((*ingesttypes.StorableReportAgent)(nil)).Where("agent_id = ?", agent).Exists(ctx); err != nil || exists {
		return false, exists, err
	}
	if exists, err = s.create(ctx, agent, now); err != nil || !exists {
		return false, exists, err
	}
	updated, err = run()
	return updated, true, err
}

// create makes the agent's record, unless newAgents records were made in
// the last newAgentWindow; it reports whether the record exists.
func (s *ReportStore) create(ctx context.Context, agent string, now time.Time) (bool, error) {
	db := s.store.BunDBCtx(ctx)
	recent, err := db.NewSelect().Model((*ingesttypes.StorableReportAgent)(nil)).Where("created_at > ?", now.Add(-newAgentWindow)).Count(ctx)
	if err != nil {
		return false, err
	}
	if recent >= newAgents {
		return false, nil
	}
	_, err = db.NewInsert().
		Model(&ingesttypes.StorableReportAgent{AgentID: agent, CreatedAt: now, UpdatedAt: now}).
		On("CONFLICT (agent_id) DO NOTHING").
		Exec(ctx)
	return err == nil, err
}

// applyWindow replaces the agent's window values with rows.
func (s *ReportStore) applyWindow(ctx context.Context, agent string, rows []ingesttypes.StorableReportApplication) error {
	db := s.store.BunDBCtx(ctx)
	if _, err := db.NewDelete().Model((*ingesttypes.StorableReportApplication)(nil)).Where("agent_id = ?", agent).Exec(ctx); err != nil {
		return err
	}
	for start := 0; start < len(rows); start += insertBatch {
		batch := rows[start:min(start+insertBatch, len(rows))]
		if _, err := db.NewInsert().Model(&batch).Exec(ctx); err != nil {
			return err
		}
	}
	return nil
}

// windowValues are the report's applications with anything in the window.
// The report is from an authenticated collector, but its strings come from
// clients (G5): entries out of the schema's bounds are dropped, and a
// string out of its bounds is emptied.
func windowValues(agent string, r *ingestreport.Report, now time.Time) []ingesttypes.StorableReportApplication {
	rows := make([]ingesttypes.StorableReportApplication, 0, len(r.Applications))
	seen := make(map[string]bool, len(r.Applications))
	for i := range r.Applications {
		app := &r.Applications[i]
		id, err := valuer.NewUUID(app.ID)
		if err != nil || seen[id.StringValue()] {
			continue
		}
		seen[id.StringValue()] = true
		row := ingesttypes.StorableReportApplication{
			ApplicationID: id.StringValue(),
			AgentID:       agent,
			Sessions:      app.Counts.Sessions,
			Views:         app.Counts.Views,
			Errors:        app.Counts.Errors,
			Vitals:        app.Counts.Vitals,
			ReportedAt:    now,
		}
		if boundedText(app.SDK.Name, maxSDKName) && boundedText(app.SDK.Version, maxSDKVersion) {
			row.SDKName, row.SDKVersion = app.SDK.Name, app.SDK.Version
		}
		rejections := rejectionsOf(app.Rejections, now)
		if row.Sessions == 0 && row.Views == 0 && row.Errors == 0 && row.Vitals == 0 && row.SDKName == "" && len(rejections) == 0 {
			continue
		}
		data, _ := json.Marshal(rejections)
		row.Rejections = string(data)
		rows = append(rows, row)
	}
	return rows
}

func rejectionsOf(in []ingestreport.RejectionReport, now time.Time) []ingesttypes.ReportedRejection {
	out := make([]ingesttypes.ReportedRejection, 0, len(in))
	seen := map[string]bool{}
	for _, r := range in {
		if !reportReasons[r.Reason] || seen[r.Reason] || r.Count <= 0 {
			continue
		}
		at, ok := reportedTime(r.LastSeenAt, now)
		if !ok {
			continue
		}
		seen[r.Reason] = true
		out = append(out, ingesttypes.ReportedRejection{Reason: r.Reason, Count: r.Count, LastOrigin: lastOrigin(r.Reason, r.LastOrigin), LastSeenAt: at})
	}
	return out
}

// lastOrigin keeps the origin of origin_not_allowed and the package of
// package_not_allowed when well formed (§10.3), and nothing else.
func lastOrigin(reason, value string) string {
	if value == "" || len(value) > maxLastOrigin {
		return ""
	}
	switch reason {
	case rumtypes.RejectionReasonOriginNotAllowed.StringValue():
		if wellFormedOrigin(value) {
			return value
		}
	case rumtypes.RejectionReasonPackageNotAllowed.StringValue():
		if rumtypes.IsWellFormedPackageName(value) {
			return value
		}
	}
	return ""
}

// wellFormedOrigin is a lower-case http or https scheme://host[:port].
func wellFormedOrigin(value string) bool {
	if value != strings.ToLower(value) {
		return false
	}
	u, err := url.Parse(value)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Hostname() == "" || u.User != nil {
		return false
	}
	if port := u.Port(); port != "" {
		if n, err := strconv.Atoi(port); err != nil || n < 1 || n > 65535 {
			return false
		}
	}
	for _, c := range u.Hostname() {
		if !(c >= 'a' && c <= 'z' || c >= '0' && c <= '9' || c == '.' || c == '-' || c == ':') {
			return false
		}
	}
	return value == u.Scheme+"://"+u.Host
}

// boundedText is printable UTF-8 of at most limit bytes.
func boundedText(s string, limit int) bool {
	if len(s) > limit || !utf8.ValidString(s) {
		return false
	}
	for _, c := range s {
		if !unicode.IsPrint(c) {
			return false
		}
	}
	return true
}

// reportedTime parses a report's timestamp, never later than now: a
// collector's clock ahead must not pin a key's last use in the future. One
// before earliestReported is dropped.
func reportedTime(s string, now time.Time) (time.Time, bool) {
	t, err := time.Parse(time.RFC3339Nano, s)
	if err != nil || t.Before(earliestReported) {
		return time.Time{}, false
	}
	if t.After(now) {
		return now, true
	}
	return t.UTC(), true
}

func durableValues(r *ingestreport.Report, now time.Time) *rumapplication.IngestUsage {
	usage := &rumapplication.IngestUsage{FirstSeen: map[valuer.UUID]time.Time{}, LastUsed: map[valuer.UUID]time.Time{}}
	for _, app := range r.Applications {
		id, err := valuer.NewUUID(app.ID)
		at, ok := reportedTime(app.FirstSeenAt, now)
		if err != nil || !ok {
			continue
		}
		if prev, dup := usage.FirstSeen[id]; !dup || at.Before(prev) {
			usage.FirstSeen[id] = at
		}
	}
	for _, key := range r.Keys {
		id, err := valuer.NewUUID(key.ID)
		at, ok := reportedTime(key.LastUsedAt, now)
		if err != nil || !ok {
			continue
		}
		if prev, dup := usage.LastUsed[id]; !dup || at.After(prev) {
			usage.LastUsed[id] = at
		}
	}
	return usage
}
