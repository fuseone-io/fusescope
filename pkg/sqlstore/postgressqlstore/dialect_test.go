package postgressqlstore_test

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/fuseone-io/fusescope/pkg/sqlstore/postgressqlstore/postgressqlstoretest"
)

func TestDialectCurrentTimestamp(t *testing.T) {
	ctx := context.Background()
	store := postgressqlstoretest.New(t)

	before := time.Now()
	now, err := store.Dialect().CurrentTimestamp(ctx, store.BunDB())
	require.NoError(t, err)
	assert.Equal(t, time.UTC, now.Location())
	assert.WithinDuration(t, before, now, time.Second)
}
