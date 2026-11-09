package flighttelemetrystore

import (
	"os"
	"sync"
	"time"
)

// watchInterval is how often the files behind a watched value are looked at again.
const watchInterval = time.Second

// watched is a value parsed from files, parsed again when any of them changes. A change that
// does not parse keeps the last good value, so a half-written rotation never takes a client down.
type watched[T any] struct {
	paths   []string
	parse   func(contents [][]byte) (T, error)
	now     func() time.Time
	mu      sync.Mutex
	value   T
	version uint64
	stamps  []stamp
	checked time.Time
	failed  func(error)
}

type stamp struct {
	modTime time.Time
	size    int64
}

func newWatched[T any](parse func([][]byte) (T, error), failed func(error), paths ...string) (*watched[T], error) {
	w := &watched[T]{paths: paths, parse: parse, now: time.Now, failed: failed}
	if err := w.load(); err != nil {
		return nil, err
	}
	return w, nil
}

func (w *watched[T]) get() T {
	value, _ := w.current()
	return value
}

// current is the value and its version, which grows every time a change loads.
func (w *watched[T]) current() (T, uint64) {
	w.mu.Lock()
	defer w.mu.Unlock()
	if now := w.now(); now.Sub(w.checked) >= watchInterval {
		w.checked = now
		if err := w.reloadIfChanged(); err != nil {
			w.failed(err)
		}
	}
	return w.value, w.version
}

func (w *watched[T]) reloadIfChanged() error {
	stamps, err := w.stat()
	if err != nil {
		return err
	}
	for i := range stamps {
		if stamps[i] != w.stamps[i] {
			return w.load()
		}
	}
	return nil
}

func (w *watched[T]) load() error {
	stamps, err := w.stat()
	if err != nil {
		return err
	}
	contents := make([][]byte, len(w.paths))
	for i, path := range w.paths {
		if contents[i], err = os.ReadFile(path); err != nil {
			return err
		}
	}
	value, err := w.parse(contents)
	if err != nil {
		return err
	}
	w.value, w.stamps = value, stamps
	w.version++
	return nil
}

func (w *watched[T]) stat() ([]stamp, error) {
	stamps := make([]stamp, len(w.paths))
	for i, path := range w.paths {
		info, err := os.Stat(path)
		if err != nil {
			return nil, err
		}
		stamps[i] = stamp{modTime: info.ModTime(), size: info.Size()}
	}
	return stamps, nil
}
