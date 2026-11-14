package telemetrymetadata

import (
	"context"
	"encoding/json"
	"maps"
	"slices"
	"strings"
	"sync"

	"github.com/fuseone-io/fusescope/pkg/types/telemetrytypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
)

type keyMemoContextKey struct{}

// keyMemo holds the engine key resolutions of one request.
type keyMemo struct {
	mu      sync.Mutex
	entries map[string]*keyMemoEntry
}

// keyMemoEntry is one resolution; done closes once keys, complete and err are set.
type keyMemoEntry struct {
	done     chan struct{}
	keys     map[string][]*telemetrytypes.TelemetryFieldKey
	complete bool
	err      error
}

// WithKeyMemo gives ctx a memo of its own, so every engine key resolution of the same org and
// selectors made under it lists the engine once. It is for one request: a resolution under a
// context without it, or under another memo, lists again. A failed resolution is not kept.
func WithKeyMemo(ctx context.Context) context.Context {
	return context.WithValue(ctx, keyMemoContextKey{}, &keyMemo{entries: map[string]*keyMemoEntry{}})
}

// memoized answers resolve once per org and selector set under ctx's memo, each caller with a
// copy of its own; without a memo it resolves every time.
func memoized(ctx context.Context, orgID valuer.UUID, selectors []*telemetrytypes.FieldKeySelector, resolve func() (map[string][]*telemetrytypes.TelemetryFieldKey, bool, error)) (map[string][]*telemetrytypes.TelemetryFieldKey, bool, error) {
	memo, ok := ctx.Value(keyMemoContextKey{}).(*keyMemo)
	if !ok {
		return resolve()
	}
	id, err := memoKey(orgID, selectors)
	if err != nil {
		return resolve()
	}
	memo.mu.Lock()
	entry, found := memo.entries[id]
	if !found {
		entry = &keyMemoEntry{done: make(chan struct{})}
		memo.entries[id] = entry
	}
	memo.mu.Unlock()

	if found {
		select {
		case <-entry.done:
		case <-ctx.Done():
			return nil, false, ctx.Err()
		}
		return copyKeys(entry.keys), entry.complete, entry.err
	}
	entry.keys, entry.complete, entry.err = resolve()
	if entry.err != nil {
		memo.mu.Lock()
		delete(memo.entries, id)
		memo.mu.Unlock()
	}
	close(entry.done)
	return copyKeys(entry.keys), entry.complete, entry.err
}

// memoKey is the org and the set of selectors, each with every field, in a canonical order.
func memoKey(orgID valuer.UUID, selectors []*telemetrytypes.FieldKeySelector) (string, error) {
	set := map[string]bool{}
	for _, selector := range selectors {
		raw, err := json.Marshal(selector)
		if err != nil {
			return "", err
		}
		set[string(raw)] = true
	}
	return orgID.StringValue() + "\n" + strings.Join(slices.Sorted(maps.Keys(set)), "\n"), nil
}

func copyKeys(keys map[string][]*telemetrytypes.TelemetryFieldKey) map[string][]*telemetrytypes.TelemetryFieldKey {
	if keys == nil {
		return nil
	}
	out := make(map[string][]*telemetrytypes.TelemetryFieldKey, len(keys))
	for name, list := range keys {
		copied := make([]*telemetrytypes.TelemetryFieldKey, len(list))
		for i, key := range list {
			k := *key
			k.Indexes, k.Evolutions = slices.Clone(key.Indexes), slices.Clone(key.Evolutions)
			copied[i] = &k
		}
		out[name] = copied
	}
	return out
}
