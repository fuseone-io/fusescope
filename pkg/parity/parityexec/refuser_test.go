package parityexec

import (
	"context"
	"testing"

	"github.com/fuseone-io/fusescope/pkg/errors"
	qbtypes "github.com/fuseone-io/fusescope/pkg/types/querybuildertypes/querybuildertypesv5"
	"github.com/fuseone-io/fusescope/pkg/valuer"
	"github.com/stretchr/testify/assert"
)

func TestEveryClickhouseCallOfTheEngineGraphIsRefusedAndCountedForItsPair(t *testing.T) {
	r := NewRefuser()
	ctx := WithPair(context.Background(), 7)
	db := r.ClickhouseDB()
	calls := map[string]func() error{
		"query":    func() error { _, err := db.Query(ctx, "SELECT 1"); return err },
		"select":   func() error { return db.Select(ctx, nil, "SELECT 1") },
		"row":      func() error { return db.QueryRow(ctx, "SELECT 1").Err() },
		"exec":     func() error { return db.Exec(ctx, "SELECT 1") },
		"batch":    func() error { _, err := db.PrepareBatch(ctx, "INSERT"); return err },
		"ping":     func() error { return db.Ping(ctx) },
		"estimate": func() error { _, err := r.Estimate(ctx, "SELECT 1"); return err },
		"plan":     func() error { return r.Plan(ctx, "SELECT 1") },
		"indexes":  func() error { _, _, err := r.Indexes(ctx, "SELECT 1"); return err },
		"builder": func() error {
			_, err := r.Builder().Build(ctx, valuer.GenerateUUID(), 0, 1, qbtypes.RequestTypeRaw, qbtypes.QueryBuilderQuery[qbtypes.TraceAggregation]{}, nil)
			return err
		},
	}
	for name, call := range calls {
		err := call()
		assert.True(t, errors.Asc(err, ErrCodeFallbackAttempted), "%s: %v", name, err)
	}
	assert.Equal(t, len(calls), r.Touches(7))
	assert.Zero(t, r.Touches(8), "another pair's count is its own")
	assert.Zero(t, r.Unattributed())

	_, err := db.Query(context.Background(), "SELECT 1")
	assert.Error(t, err)
	assert.Equal(t, 1, r.Unattributed(), "a call outside any pair is still counted")
	_, err = db.ServerVersion()
	assert.Error(t, err)
	assert.Equal(t, 2, r.Unattributed())
}
