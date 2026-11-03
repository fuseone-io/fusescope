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

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/modules/rumapplication"
	"github.com/fuseone-io/fusescope/pkg/sqlstore"
	"github.com/fuseone-io/fusescope/pkg/types/ingesttypes"
)

var (
	ErrCodeUnpublishable = errors.MustNewCode("ingest_policy_unpublishable")
	ErrCodeExhausted     = errors.MustNewCode("ingest_policy_version_exhausted")
)

// Snapshot is a published revision: its version and the exact bytes sent.
type Snapshot struct {
	Version uint64
	Data    []byte
}

// Source is the content of the policy.
type Source interface {
	IngestPolicyContent(ctx context.Context, now time.Time) (*rumapplication.IngestContent, error)
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
	store  sqlstore.SQLStore
	source Source
	logger *slog.Logger
	// clock is the database's: one clock for every replica.
	clock   func(ctx context.Context) (time.Time, error)
	current atomic.Pointer[Snapshot]
}

func NewPublisher(store sqlstore.SQLStore, source Source, logger *slog.Logger) *Publisher {
	publisher := &Publisher{store: store, source: source, logger: logger}
	publisher.clock = publisher.databaseNow
	return publisher
}

// State is the revision row as another replica may have left it.
type State struct {
	Version uint64
	// Pending is set while a change is recorded that no revision has read.
	Pending bool
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
		row, err := publisher.lockRevision(ctx)
		if err != nil {
			return err
		}
		now, err := publisher.effectiveTime(ctx, row)
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
		row.RevisedGeneration = row.Generation
		row.EffectiveFloor = now.Format(time.RFC3339Nano)
		row.UpdatedAt = now
		if _, err := publisher.store.BunDBCtx(ctx).
			NewUpdate().
			Model(row).
			Column("version", "content_sha256", "issued_at", "revised_generation", "effective_floor", "updated_at").
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
func encode(row *ingesttypes.StorableRevision, body content) ([]byte, error) {
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
// Generation is not bumped: a revision is not a change of the content.
func (publisher *Publisher) lockRevision(ctx context.Context) (*ingesttypes.StorableRevision, error) {
	db := publisher.store.BunDBCtx(ctx)
	lock := func() (int64, error) {
		result, err := db.NewUpdate().
			Model((*ingesttypes.StorableRevision)(nil)).
			Set("generation = generation").
			Where("id = ?", ingesttypes.RevisionID).
			Exec(ctx)
		if err != nil {
			return 0, err
		}
		return result.RowsAffected()
	}
	rows, err := lock()
	if err != nil {
		return nil, err
	}
	if rows == 0 {
		now := time.Now()
		if _, err := db.NewInsert().
			Model(&ingesttypes.StorableRevision{ID: ingesttypes.RevisionID, CreatedAt: now, UpdatedAt: now}).
			On("CONFLICT (id) DO NOTHING").
			Exec(ctx); err != nil {
			return nil, err
		}
		if _, err := lock(); err != nil {
			return nil, err
		}
	}
	row := new(ingesttypes.StorableRevision)
	if err := db.NewSelect().
		Model(row).
		Where("id = ?", ingesttypes.RevisionID).
		Scan(ctx); err != nil {
		return nil, err
	}
	return row, nil
}

// effectiveTime is when key expiry is decided: the database's clock, never
// before the time an earlier revision used. Replicas therefore agree, and
// a key one revision dropped as expired cannot return in the next.
func (publisher *Publisher) effectiveTime(ctx context.Context, row *ingesttypes.StorableRevision) (time.Time, error) {
	now, err := publisher.clock(ctx)
	if err != nil {
		return time.Time{}, err
	}
	now = now.UTC()
	if row.EffectiveFloor == "" {
		return now, nil
	}
	floor, err := time.Parse(time.RFC3339Nano, row.EffectiveFloor)
	if err != nil {
		return time.Time{}, errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "ingest policy effective_floor unreadable")
	}
	if now.Before(floor) {
		return floor, nil
	}
	return now, nil
}

func (publisher *Publisher) databaseNow(ctx context.Context) (time.Time, error) {
	var now time.Time
	err := publisher.store.BunDBCtx(ctx).
		NewSelect().
		ColumnExpr("CURRENT_TIMESTAMP").
		Scan(ctx, &now)
	return now, err
}

// State reads the revision row without locking: another replica may have
// issued a version, or a change may wait for a revision.
func (publisher *Publisher) State(ctx context.Context) (State, error) {
	row := new(ingesttypes.StorableRevision)
	err := publisher.store.BunDBCtx(ctx).
		NewSelect().
		Model(row).
		Column("version", "generation", "revised_generation").
		Where("id = ?", ingesttypes.RevisionID).
		Scan(ctx)
	if errors.Is(err, sql.ErrNoRows) {
		return State{}, nil
	}
	if err != nil {
		return State{}, err
	}
	return State{Version: uint64(row.Version), Pending: row.Generation != row.RevisedGeneration}, nil
}
