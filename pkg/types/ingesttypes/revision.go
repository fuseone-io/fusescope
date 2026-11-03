// Package ingesttypes holds the revision of the collectors' ingest policy
// (ADR 0010 §10), shared by the modules that change its content and the
// publisher that issues it.
package ingesttypes

import (
	"context"
	"time"

	"github.com/uptrace/bun"
)

// RevisionID is the one row of ingest_policy_revision.
const RevisionID = "ingest_policy"

// StorableRevision is the policy's durable state for the deployment.
type StorableRevision struct {
	bun.BaseModel `bun:"table:ingest_policy_revision"`

	ID            string `bun:"id,pk"`
	Version       int64  `bun:"version"`
	ContentSHA256 string `bun:"content_sha256"`
	IssuedAt      string `bun:"issued_at"`
	// Generation counts changes of the content, bumped in the transaction
	// of each change, so no replica can miss one; RevisedGeneration is the
	// generation the last revision read.
	Generation        int64 `bun:"generation"`
	RevisedGeneration int64 `bun:"revised_generation"`
	// EffectiveFloor is the latest time a revision decided key expiry at,
	// RFC 3339 with nanoseconds; the time used never goes back, so a
	// replica behind another cannot bring an expired key back.
	EffectiveFloor string `bun:"effective_floor"`
	// Producer is the version of the code that issued the revision; an
	// older one does not overwrite it (pkg/query-service/app/opamp/ingest).
	Producer int64 `bun:"producer"`
	// Data is the policy message as published, sent by every replica.
	Data      string    `bun:"data"`
	CreatedAt time.Time `bun:"created_at"`
	UpdatedAt time.Time `bun:"updated_at"`
}

// Touch records a change of the content in the caller's transaction. It
// locks the revision row, creating it, so changes and revisions are
// serialised: a check made after it, such as a capacity count, holds until
// the transaction ends.
func Touch(ctx context.Context, db bun.IDB, now time.Time) error {
	result, err := db.NewUpdate().
		Model((*StorableRevision)(nil)).
		Set("generation = generation + 1").
		Set("updated_at = ?", now).
		Where("id = ?", RevisionID).
		Exec(ctx)
	if err != nil {
		return err
	}
	if rows, err := result.RowsAffected(); err == nil && rows > 0 {
		return nil
	}
	if _, err := db.NewInsert().
		Model(&StorableRevision{ID: RevisionID, CreatedAt: now, UpdatedAt: now}).
		On("CONFLICT (id) DO NOTHING").
		Exec(ctx); err != nil {
		return err
	}
	_, err = db.NewUpdate().
		Model((*StorableRevision)(nil)).
		Set("generation = generation + 1").
		Set("updated_at = ?", now).
		Where("id = ?", RevisionID).
		Exec(ctx)
	return err
}
