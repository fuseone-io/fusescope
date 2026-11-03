// Package ingest publishes the collectors' ingest policy over OpAMP
// (ADR 0010 §§3, 10; fusescope-collector-server docs/spec/rum.md §11) to
// the collectors of the ingress role.
package ingest

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"log/slog"
	"math"
	"sync/atomic"
	"time"

	"github.com/fuseone-io/fusescope-collector-server/components/pkg/ingestpolicy"
	"github.com/uptrace/bun"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/modules/rumapplication"
	"github.com/fuseone-io/fusescope/pkg/sqlstore"
)

var (
	ErrCodeUnpublishable = errors.MustNewCode("ingest_policy_unpublishable")
	ErrCodeExhausted     = errors.MustNewCode("ingest_policy_version_exhausted")
)

// revisionID is the one row of ingest_policy_revision.
const revisionID = "ingest_policy"

// Snapshot is a published revision: its version and the exact bytes sent.
type Snapshot struct {
	Version uint64
	Data    []byte
}

// Source is the content of the policy.
type Source interface {
	IngestPolicyContent(ctx context.Context, now time.Time) (*rumapplication.IngestContent, error)
}

type revision struct {
	bun.BaseModel `bun:"table:ingest_policy_revision"`

	ID            string    `bun:"id,pk"`
	Version       int64     `bun:"version"`
	ContentSHA256 string    `bun:"content_sha256"`
	IssuedAt      string    `bun:"issued_at"`
	CreatedAt     time.Time `bun:"created_at"`
	UpdatedAt     time.Time `bun:"updated_at"`
}

// content is what the version covers: a change of it is a new version.
type content struct {
	Keys            []ingestpolicy.Key            `json:"keys"`
	RUMApplications []ingestpolicy.RUMApplication `json:"rumApplications"`
}

// Publisher keeps the current snapshot. Revise builds it in one
// transaction that first locks the revision row, so concurrent replicas are
// serialised and none issues a higher version for content older than a
// committed one: a revoked key cannot come back.
type Publisher struct {
	store   sqlstore.SQLStore
	source  Source
	logger  *slog.Logger
	now     func() time.Time
	current atomic.Pointer[Snapshot]
}

func NewPublisher(store sqlstore.SQLStore, source Source, logger *slog.Logger) *Publisher {
	return &Publisher{store: store, source: source, logger: logger, now: time.Now}
}

// Current is the snapshot last revised, nil before the first.
func (publisher *Publisher) Current() *Snapshot { return publisher.current.Load() }

// Revise rebuilds the snapshot from the database and returns whether its
// version changed. Content the collector would reject, or over the 24 MiB
// cap, is not published: the version is not bumped and the current
// snapshot stays in force.
func (publisher *Publisher) Revise(ctx context.Context) (bool, error) {
	var next *Snapshot
	err := publisher.store.RunInTxCtx(ctx, nil, func(ctx context.Context) error {
		now := publisher.now().UTC()
		row, err := publisher.lockRevision(ctx, now)
		if err != nil {
			return err
		}
		ingestContent, err := publisher.source.IngestPolicyContent(ctx, now)
		if err != nil {
			return err
		}
		body := content{Keys: ingestContent.Keys, RUMApplications: ingestContent.Applications}
		encoded, err := json.Marshal(body)
		if err != nil {
			return err
		}
		sum := sha256.Sum256(encoded)
		contentSHA := hex.EncodeToString(sum[:])
		if contentSHA != row.ContentSHA256 {
			if row.Version == math.MaxInt64 {
				return errors.Newf(errors.TypeInternal, ErrCodeExhausted, "ingest policy version exhausted")
			}
			row.Version++
			row.ContentSHA256 = contentSHA
			row.IssuedAt = now.Format(time.RFC3339)
		}
		data, err := encode(row, body)
		if err != nil {
			return err
		}
		if _, err := publisher.store.BunDBCtx(ctx).
			NewUpdate().
			Model(row).
			Column("version", "content_sha256", "issued_at", "updated_at").
			WherePK().
			Exec(ctx); err != nil {
			return err
		}
		next = &Snapshot{Version: uint64(row.Version), Data: data}
		return nil
	})
	if err != nil {
		return false, err
	}
	previous := publisher.current.Swap(next)
	return previous == nil || previous.Version != next.Version, nil
}

// encode is the policy message of a revision, checked as the collector
// checks it (rum.md §11.2).
func encode(row *revision, body content) ([]byte, error) {
	data, err := json.Marshal(&ingestpolicy.Policy{
		SchemaVersion:   ingestpolicy.SchemaVersion,
		Version:         uint64(row.Version),
		IssuedAt:        row.IssuedAt,
		Keys:            body.Keys,
		RUMApplications: body.RUMApplications,
	})
	if err != nil {
		return nil, err
	}
	policy, err := ingestpolicy.Parse(data)
	if err == nil {
		err = ingestpolicy.Validate(policy)
	}
	if err != nil {
		var rejection *ingestpolicy.RejectionError
		if errors.As(err, &rejection) {
			return nil, errors.Newf(errors.TypeInternal, ErrCodeUnpublishable, "ingest policy not published: the collector would reject it as %s at %q", rejection.Code, rejection.Path)
		}
		return nil, err
	}
	return data, nil
}

// lockRevision takes the revision row for update, creating it at version 0.
func (publisher *Publisher) lockRevision(ctx context.Context, now time.Time) (*revision, error) {
	db := publisher.store.BunDBCtx(ctx)
	result, err := db.NewUpdate().
		Model((*revision)(nil)).
		Set("updated_at = ?", now).
		Where("id = ?", revisionID).
		Exec(ctx)
	if err != nil {
		return nil, err
	}
	if rows, err := result.RowsAffected(); err != nil || rows == 0 {
		if _, err := db.NewInsert().
			Model(&revision{ID: revisionID, CreatedAt: now, UpdatedAt: now}).
			On("CONFLICT (id) DO NOTHING").
			Exec(ctx); err != nil {
			return nil, err
		}
		if _, err := db.NewUpdate().
			Model((*revision)(nil)).
			Set("updated_at = ?", now).
			Where("id = ?", revisionID).
			Exec(ctx); err != nil {
			return nil, err
		}
	}
	row := new(revision)
	if err := db.NewSelect().
		Model(row).
		Where("id = ?", revisionID).
		Scan(ctx); err != nil {
		return nil, err
	}
	return row, nil
}

// PublishedVersion reads the version in the database, without locking:
// another replica may have issued a newer one.
func (publisher *Publisher) PublishedVersion(ctx context.Context) (uint64, error) {
	row := new(revision)
	err := publisher.store.BunDBCtx(ctx).
		NewSelect().
		Model(row).
		Column("version").
		Where("id = ?", revisionID).
		Scan(ctx)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, nil
	}
	if err != nil {
		return 0, err
	}
	return uint64(row.Version), nil
}
