package implrumapplication

import (
	"context"
	"io"
	"log/slog"
	"sync"
	"time"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/modules/rumapplication"
	"github.com/fuseone-io/fusescope/pkg/types/rumtypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
	"golang.org/x/sync/singleflight"
)

const maxSourceMapIndexEntries = 10000

type sourceMapSymbolicator struct {
	store        rumtypes.Store
	storage      rumapplication.SourceMapStorage
	logger       *slog.Logger
	contextLines int
	maps         *sourceMapCache
	loads        singleflight.Group

	// indexes caches each release's files; other instances' uploads and
	// deletes show within indexTTL.
	indexTTL time.Duration
	mu       sync.Mutex
	indexes  map[string]sourceMapIndexEntry
	usage    map[valuer.UUID]time.Time
}

type sourceMapIndexEntry struct {
	index     *rumtypes.SourceMapIndex
	files     []*rumtypes.StorableSourceMap
	expiresAt time.Time
}

func NewSymbolicator(store rumtypes.Store, storage rumapplication.SourceMapStorage, logger *slog.Logger, config rumapplication.Config) rumapplication.Symbolicator {
	return &sourceMapSymbolicator{
		store:        store,
		storage:      storage,
		logger:       logger,
		contextLines: config.SourceMaps.ContextLines,
		maps:         newSourceMapCache(config.SourceMaps.CacheSize),
		indexTTL:     config.KeyCacheTTL,
		indexes:      map[string]sourceMapIndexEntry{},
		usage:        map[valuer.UUID]time.Time{},
	}
}

// Symbolicate never fails the read it serves: a map it cannot load leaves
// its frames minified.
func (symbolicator *sourceMapSymbolicator) Symbolicate(ctx context.Context, applicationID valuer.UUID, release string, frames []rumtypes.StackFrame) (*rumtypes.Symbolication, error) {
	result := &rumtypes.Symbolication{Frames: frames}
	if release == "" {
		result.MissingSourceMap = &rumtypes.MissingSourceMap{}
		return result, nil
	}

	index, err := symbolicator.index(ctx, applicationID, release)
	if err != nil {
		symbolicator.logger.WarnContext(ctx, "failed to list rum source maps, frames stay minified", errors.Attr(err))
		return result, nil
	}
	if index.Len() == 0 {
		result.MissingSourceMap = &rumtypes.MissingSourceMap{Release: release}
		return result, nil
	}
	if len(frames) == 0 {
		return result, nil
	}

	now := time.Now()
	result.Frames, result.Symbolicated = rumtypes.SymbolicateFrames(frames, func(file string) (*rumtypes.SourceMap, string) {
		match := index.Match(file, "")
		if match == nil {
			return nil, ""
		}
		sourceMap, err := symbolicator.load(ctx, match)
		if err != nil {
			symbolicator.logger.WarnContext(ctx, "failed to load rum source map, its frames stay minified", slog.String("source_map_id", match.ID.StringValue()), errors.Attr(err))
			return nil, ""
		}
		symbolicator.markUsed(match.ID, now)
		return sourceMap, match.Path
	}, symbolicator.contextLines)
	return result, nil
}

func (symbolicator *sourceMapSymbolicator) Forget(applicationID valuer.UUID, release string) {
	symbolicator.mu.Lock()
	entry, ok := symbolicator.indexes[indexKey(applicationID, release)]
	delete(symbolicator.indexes, indexKey(applicationID, release))
	symbolicator.mu.Unlock()

	if ok {
		for _, file := range entry.files {
			symbolicator.maps.Remove(file.ID.StringValue())
		}
	}
}

func (symbolicator *sourceMapSymbolicator) TakeUsage() map[valuer.UUID]time.Time {
	symbolicator.mu.Lock()
	defer symbolicator.mu.Unlock()

	usage := symbolicator.usage
	symbolicator.usage = map[valuer.UUID]time.Time{}
	return usage
}

func (symbolicator *sourceMapSymbolicator) index(ctx context.Context, applicationID valuer.UUID, release string) (*rumtypes.SourceMapIndex, error) {
	key, now := indexKey(applicationID, release), time.Now()

	symbolicator.mu.Lock()
	entry, ok := symbolicator.indexes[key]
	symbolicator.mu.Unlock()
	if ok && now.Before(entry.expiresAt) {
		return entry.index, nil
	}

	files, err := symbolicator.store.ListReleaseSourceMaps(ctx, applicationID, release)
	if err != nil {
		return nil, err
	}
	entry = sourceMapIndexEntry{index: rumtypes.NewSourceMapIndex(files), files: files, expiresAt: now.Add(symbolicator.indexTTL)}

	symbolicator.mu.Lock()
	if len(symbolicator.indexes) >= maxSourceMapIndexEntries {
		symbolicator.indexes = map[string]sourceMapIndexEntry{}
	}
	symbolicator.indexes[key] = entry
	symbolicator.mu.Unlock()
	return entry.index, nil
}

func (symbolicator *sourceMapSymbolicator) load(ctx context.Context, file *rumtypes.StorableSourceMap) (*rumtypes.SourceMap, error) {
	key := file.ID.StringValue()
	if sourceMap, ok := symbolicator.maps.Get(key); ok {
		return sourceMap, nil
	}

	loaded, err, _ := symbolicator.loads.Do(key, func() (any, error) {
		reader, err := symbolicator.storage.Open(ctx, file.StorageKey())
		if err != nil {
			return nil, err
		}
		defer reader.Close()

		data, err := io.ReadAll(reader)
		if err != nil {
			return nil, errors.WrapInternalf(err, ErrCodeSourceMapStorage, "failed to read source map")
		}
		sourceMap, err := rumtypes.ParseSourceMap(data)
		if err != nil {
			return nil, err
		}
		symbolicator.maps.Add(key, sourceMap)
		return sourceMap, nil
	})
	if err != nil {
		return nil, err
	}
	return loaded.(*rumtypes.SourceMap), nil
}

func (symbolicator *sourceMapSymbolicator) markUsed(id valuer.UUID, at time.Time) {
	symbolicator.mu.Lock()
	defer symbolicator.mu.Unlock()

	symbolicator.usage[id] = at
}

func indexKey(applicationID valuer.UUID, release string) string {
	return applicationID.StringValue() + "\x00" + release
}
