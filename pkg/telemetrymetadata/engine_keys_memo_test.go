package telemetrymetadata

import (
	"context"
	"sync"
	"testing"

	"github.com/fuseone-io/fusescope/pkg/telemetrystore"
	"github.com/fuseone-io/fusescope/pkg/types/telemetrytypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// lockedEngine serializes keysEngine's calls, for resolutions from many goroutines.
type lockedEngine struct {
	*keysEngine
	mu sync.Mutex
}

func (e *lockedEngine) list(ctx context.Context, store *EngineKeyStore, orgID valuer.UUID, selectors ...*telemetrytypes.FieldKeySelector) map[string][]*telemetrytypes.TelemetryFieldKey {
	keys, _, err := store.GetKeysMulti(ctx, orgID, selectors)
	require.NoError(e.t, err)
	return keys
}

func memoEngine(t *testing.T) (*keysEngine, *EngineKeyStore) {
	engine := &keysEngine{t: t, rows: []keyRow{{"http.route", "span", "string"}}}
	return engine, NewEngineKeyStore(engine)
}

func TestARequestResolvesTheSameSelectorsOnce(t *testing.T) {
	engine, store := memoEngine(t)
	ctx := WithKeyMemo(caller())
	for range 3 {
		_, _, err := store.GetKeysMulti(ctx, org, []*telemetrytypes.FieldKeySelector{exact("http.route"), exact("db.name")})
		require.NoError(t, err)
	}
	_, _, err := store.GetKeysMulti(ctx, org, []*telemetrytypes.FieldKeySelector{exact("db.name"), exact("http.route")})
	require.NoError(t, err)
	assert.Len(t, engine.calls, 1, "the same selectors in another order")
}

func TestTheMemoKeysEverySelectorField(t *testing.T) {
	engine, store := memoEngine(t)
	ctx := WithKeyMemo(caller())
	variants := []func(*telemetrytypes.FieldKeySelector){
		func(*telemetrytypes.FieldKeySelector) {},
		func(s *telemetrytypes.FieldKeySelector) { s.FieldContext = telemetrytypes.FieldContextResource },
		func(s *telemetrytypes.FieldKeySelector) { s.FieldDataType = telemetrytypes.FieldDataTypeString },
		func(s *telemetrytypes.FieldKeySelector) {
			s.SelectorMatchType = telemetrytypes.FieldSelectorMatchTypeFuzzy
		},
		func(s *telemetrytypes.FieldKeySelector) { s.Signal = telemetrytypes.SignalUnspecified },
		func(s *telemetrytypes.FieldKeySelector) { s.Limit = 5 },
		func(s *telemetrytypes.FieldKeySelector) { s.Name = "http" },
	}
	for _, vary := range variants {
		selector := exact("http.route")
		vary(selector)
		_, _, err := store.GetKeysMulti(ctx, org, []*telemetrytypes.FieldKeySelector{selector})
		require.NoError(t, err)
	}
	assert.Len(t, engine.calls, len(variants))
}

func TestTheMemoIsNeitherSharedAcrossTenantsNorRequests(t *testing.T) {
	engine, store := memoEngine(t)
	ctx := WithKeyMemo(caller())
	other := valuer.GenerateUUID()
	for _, orgID := range []valuer.UUID{org, other, org, other} {
		_, _, err := store.GetKeysMulti(ctx, orgID, []*telemetrytypes.FieldKeySelector{exact("http.route")})
		require.NoError(t, err)
	}
	assert.Len(t, engine.calls, 2, "one per tenant")

	for range 2 {
		_, _, err := store.GetKeysMulti(WithKeyMemo(caller()), org, []*telemetrytypes.FieldKeySelector{exact("http.route")})
		require.NoError(t, err)
	}
	for range 2 {
		_, _, err := store.GetKeysMulti(caller(), org, []*telemetrytypes.FieldKeySelector{exact("http.route")})
		require.NoError(t, err)
	}
	assert.Len(t, engine.calls, 6, "a new request, or none, lists again")
}

func TestConcurrentResolutionsOfARequestShareOneListing(t *testing.T) {
	inner, _ := memoEngine(t)
	engine := &lockedEngine{keysEngine: inner}
	store := NewEngineKeyStore(lockedDo{engine})
	ctx := WithKeyMemo(caller())
	var wg sync.WaitGroup
	for range 16 {
		wg.Go(func() { engine.list(ctx, store, org, exact("http.route")) })
	}
	wg.Wait()
	assert.Len(t, inner.calls, 1)
}

func TestAMemoizedAnswerIsTheCallersToChange(t *testing.T) {
	_, store := memoEngine(t)
	ctx := WithKeyMemo(caller())
	for range 3 {
		keys, _, err := store.GetKeysMulti(ctx, org, []*telemetrytypes.FieldKeySelector{exact("http.route")})
		require.NoError(t, err)
		assert.Equal(t, telemetrytypes.FieldContextAttribute, keys["http.route"][0].FieldContext)
		assert.NotContains(t, keys, "injected")
		keys["http.route"][0].FieldContext = telemetrytypes.FieldContextResource
		keys["injected"] = nil
	}
}

func TestAFailedResolutionIsNotKept(t *testing.T) {
	engine, store := memoEngine(t)
	ctx := WithKeyMemo(caller())
	engine.warnings = []string{"ingester_unavailable"}
	_, _, err := store.GetKeysMulti(ctx, org, []*telemetrytypes.FieldKeySelector{exact("http.route")})
	require.Error(t, err)
	engine.warnings = nil
	_, _, err = store.GetKeysMulti(ctx, org, []*telemetrytypes.FieldKeySelector{exact("http.route")})
	require.NoError(t, err)
	assert.Len(t, engine.calls, 2)
}

// lockedDo is a store whose Do runs under the engine's lock.
type lockedDo struct{ *lockedEngine }

func (s lockedDo) Do(ctx context.Context, action string, body []byte) (telemetrystore.Rows, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.keysEngine.Do(ctx, action, body)
}
