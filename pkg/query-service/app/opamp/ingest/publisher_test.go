package ingest

import (
	"context"
	"fmt"
	"log/slog"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/fuseone-io/fusescope-collector-server/components/pkg/ingestpolicy"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/fuseone-io/fusescope/pkg/factory/factorytest"
	"github.com/fuseone-io/fusescope/pkg/modules/rumapplication"
	"github.com/fuseone-io/fusescope/pkg/sqlstore"
	"github.com/fuseone-io/fusescope/pkg/sqlstore/sqlitesqlstore"
)

const (
	testOrg = "0191c5e2-0000-7000-8000-00000000000a"
	testApp = "0191c5e2-7f0a-7c3e-9a51-3c2b1d4e5f60"
)

func newTestStore(t *testing.T) sqlstore.SQLStore {
	t.Helper()
	ctx := context.Background()
	store, err := sqlitesqlstore.New(ctx, factorytest.NewSettings(), sqlstore.Config{
		Provider:   "sqlite",
		Connection: sqlstore.ConnectionConfig{MaxOpenConns: 10},
		Sqlite:     sqlstore.SqliteConfig{Path: filepath.Join(t.TempDir(), "ingest.db"), Mode: "wal", BusyTimeout: 5 * time.Second, TransactionMode: "deferred"},
	})
	require.NoError(t, err)
	_, err = store.BunDB().NewCreateTable().Model((*revision)(nil)).IfNotExists().Exec(ctx)
	require.NoError(t, err)
	return store
}

// fakeSource is policy content that tests change.
type fakeSource struct {
	mu      sync.Mutex
	content *rumapplication.IngestContent
	err     error
}

func (f *fakeSource) IngestPolicyContent(context.Context, time.Time) (*rumapplication.IngestContent, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.content, f.err
}

func (f *fakeSource) set(keys int) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.content = testContent(keys)
}

func testContent(keys int) *rumapplication.IngestContent {
	app := testApp
	c := &rumapplication.IngestContent{
		Keys: []ingestpolicy.Key{},
		Applications: []ingestpolicy.RUMApplication{{
			ID: testApp, OrgID: testOrg, Name: "shop-web", Environment: "production", Platform: ingestpolicy.PlatformWeb,
			AllowedOrigins: []string{"https://shop.example.com"}, AllowedPackageNames: []string{},
			PIIPolicy: ingestpolicy.PIIPolicy{DropQuery: true, QueryAllowlist: []string{}, URLAllowlist: []string{}},
		}},
	}
	for i := range keys {
		c.Keys = append(c.Keys, ingestpolicy.Key{
			ID: fmt.Sprintf("0191c5e2-8a1b-7d2e-b0c4-%012d", i), SHA256: fmt.Sprintf("%064x", i+1), OrgID: testOrg,
			Kind: ingestpolicy.KindPublic, Signals: []string{"traces", "logs"}, ApplicationID: &app,
		})
	}
	return c
}

func at(t time.Time) func() time.Time { return func() time.Time { return t } }

func TestPublisherRevise(t *testing.T) {
	ctx := context.Background()
	store := newTestStore(t)
	source := &fakeSource{}
	source.set(1)
	first := NewPublisher(store, source, slogDiscard())
	first.now = at(time.Date(2026, 11, 3, 12, 0, 0, 0, time.UTC))

	version, err := first.PublishedVersion(ctx)
	require.NoError(t, err)
	assert.Zero(t, version, "nothing published yet")

	changed, err := first.Revise(ctx)
	require.NoError(t, err)
	assert.True(t, changed)
	v1 := first.Current()
	require.NotNil(t, v1)
	assert.Equal(t, uint64(1), v1.Version)
	policy, err := ingestpolicy.Parse(v1.Data)
	require.NoError(t, err)
	assert.Equal(t, "2026-11-03T12:00:00Z", policy.IssuedAt)
	assert.Len(t, policy.Keys, 1)

	// The same content later, and from another replica, is the same version
	// and the same bytes: the collector refuses equal versions that differ.
	first.now = at(time.Date(2026, 11, 3, 13, 0, 0, 0, time.UTC))
	changed, err = first.Revise(ctx)
	require.NoError(t, err)
	assert.False(t, changed)
	assert.Equal(t, v1, first.Current())
	replica := NewPublisher(store, source, slogDiscard())
	replica.now = at(time.Date(2026, 11, 3, 14, 0, 0, 0, time.UTC))
	_, err = replica.Revise(ctx)
	require.NoError(t, err)
	assert.Equal(t, v1.Data, replica.Current().Data)

	source.set(2)
	changed, err = first.Revise(ctx)
	require.NoError(t, err)
	assert.True(t, changed)
	v2 := first.Current()
	assert.Equal(t, uint64(2), v2.Version)
	policy, err = ingestpolicy.Parse(v2.Data)
	require.NoError(t, err)
	assert.Equal(t, "2026-11-03T13:00:00Z", policy.IssuedAt, "issued when the content changed")
	version, err = replica.PublishedVersion(ctx)
	require.NoError(t, err)
	assert.Equal(t, uint64(2), version, "other replicas see the new version")
}

func TestPublisherRefusesUnpublishable(t *testing.T) {
	ctx := context.Background()
	store := newTestStore(t)
	source := &fakeSource{}
	source.set(1)
	publisher := NewPublisher(store, source, slogDiscard())
	_, err := publisher.Revise(ctx)
	require.NoError(t, err)
	held := publisher.Current()

	bad := testContent(2)
	bad.Keys[1].SHA256 = bad.Keys[0].SHA256 // duplicate_verifier
	source.mu.Lock()
	source.content = bad
	source.mu.Unlock()
	_, err = publisher.Revise(ctx)
	require.Error(t, err)
	assert.Contains(t, err.Error(), string(ingestpolicy.CodeDuplicateVerifier))
	assert.Equal(t, held, publisher.Current(), "the published snapshot stays in force")
	version, err := publisher.PublishedVersion(ctx)
	require.NoError(t, err)
	assert.Equal(t, uint64(1), version, "no version is spent on content never published")

	source.mu.Lock()
	source.content, source.err = nil, assertError("database down")
	source.mu.Unlock()
	_, err = publisher.Revise(ctx)
	require.Error(t, err)
	assert.Equal(t, held, publisher.Current())
}

// Replicas revising while the content changes never issue a version twice
// or go back: each new version is for content at least as new.
func TestPublisherConcurrentReplicas(t *testing.T) {
	ctx := context.Background()
	store := newTestStore(t)
	source := &fakeSource{}
	source.set(1)
	replicas := []*Publisher{NewPublisher(store, source, slogDiscard()), NewPublisher(store, source, slogDiscard())}

	var wg sync.WaitGroup
	for i := range 20 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if i%4 == 0 {
				source.set(1 + i/4)
			}
			_, err := replicas[i%2].Revise(ctx)
			assert.NoError(t, err)
		}()
	}
	wg.Wait()

	source.set(100)
	for _, replica := range replicas {
		_, err := replica.Revise(ctx)
		require.NoError(t, err)
	}
	assert.Equal(t, replicas[0].Current(), replicas[1].Current(), "converged on one version and one encoding")
	policy, err := ingestpolicy.Parse(replicas[0].Current().Data)
	require.NoError(t, err)
	assert.Len(t, policy.Keys, 100)
	assert.LessOrEqual(t, policy.Version, uint64(7), "one version per content change at most")
}

func slogDiscard() *slog.Logger { return slog.New(slog.DiscardHandler) }

type assertError string

func (e assertError) Error() string { return string(e) }
