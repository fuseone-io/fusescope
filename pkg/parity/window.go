package parity

import (
	"time"

	"github.com/fuseone-io/fusescope/pkg/errors"
)

var ErrCodeWindow = errors.MustNewCode("parity_window")

// WindowClass is how far behind now a window is read.
type WindowClass string

const (
	// Settled ends a margin before now, after both stores have taken in what was written.
	Settled WindowClass = "settled"
	// Recent is the last minutes, which the engine still serves from its hot window.
	Recent WindowClass = "recent"
)

// Window is the half-open interval [Start, End) in Unix nanoseconds, aligned to the step. Both
// stores are asked for exactly this window; neither reads now.
type Window struct {
	Start int64 `json:"start"`
	End   int64 `json:"end"`
}

// Retention is how long each store keeps spans; a window starts within the shorter.
type Retention struct {
	ClickHouse time.Duration
	Engine     time.Duration
}

// WindowConfig sets the windows of a round and the shortest clean subinterval the count gate keeps
// of each class.
type WindowConfig struct {
	Step          time.Duration
	SettledMargin time.Duration
	SettledLength time.Duration
	RecentLength  time.Duration
	MinSettled    time.Duration
	MinRecent     time.Duration
}

// DefaultWindowConfig is the design's: a step of 1 min, an hour settled 15 min before now, the
// last 5 min recent, and at least 30 and 5 min of either kept.
func DefaultWindowConfig() WindowConfig {
	return WindowConfig{
		Step:          time.Minute,
		SettledMargin: 15 * time.Minute,
		SettledLength: time.Hour,
		RecentLength:  5 * time.Minute,
		MinSettled:    30 * time.Minute,
		MinRecent:     5 * time.Minute,
	}
}

func (c WindowConfig) validate() error {
	if c.Step <= 0 {
		return errors.Newf(errors.TypeInvalidInput, ErrCodeWindow, "the step must be positive, got %s", c.Step)
	}
	for _, d := range []time.Duration{c.SettledMargin, c.SettledLength, c.RecentLength, c.MinSettled, c.MinRecent} {
		if d%c.Step != 0 {
			return errors.Newf(errors.TypeInvalidInput, ErrCodeWindow, "%s is not a multiple of the step %s", d, c.Step)
		}
	}
	if c.MinSettled <= 0 || c.MinRecent <= 0 || c.SettledMargin < 0 {
		return errors.Newf(errors.TypeInvalidInput, ErrCodeWindow, "the minimum lengths must be positive and the margin not negative")
	}
	if c.SettledLength < c.MinSettled || c.RecentLength < c.MinRecent {
		return errors.Newf(errors.TypeInvalidInput, ErrCodeWindow, "a window cannot be shorter than its minimum")
	}
	return nil
}

func (c WindowConfig) minimum(class WindowClass) (time.Duration, error) {
	switch class {
	case Settled:
		return c.MinSettled, nil
	case Recent:
		return c.MinRecent, nil
	}
	return 0, errors.Newf(errors.TypeInvalidInput, ErrCodeWindow, "unknown window class %q", class)
}

// PlanWindow is the window of class for a round at now. It starts no earlier than the tenant's
// dual-write epoch and the shorter retention, and ok is false when what is left is shorter than
// the class's minimum.
//
// # Errors
//
// An invalid configuration, an unknown class or a store without a retention.
func PlanWindow(cfg WindowConfig, class WindowClass, now, epoch time.Time, retention Retention) (Window, bool, error) {
	if err := cfg.validate(); err != nil {
		return Window{}, false, err
	}
	minimum, err := cfg.minimum(class)
	if err != nil {
		return Window{}, false, err
	}
	if retention.ClickHouse <= 0 || retention.Engine <= 0 {
		return Window{}, false, errors.Newf(errors.TypeInvalidInput, ErrCodeWindow, "both stores need a retention")
	}
	step := int64(cfg.Step)
	var end, length int64
	if class == Settled {
		end, length = floorTo(now.UnixNano()-int64(cfg.SettledMargin), step), int64(cfg.SettledLength)
	} else {
		end, length = floorTo(now.UnixNano(), step), int64(cfg.RecentLength)
	}
	floor := max(epoch.UnixNano(), now.UnixNano()-int64(min(retention.ClickHouse, retention.Engine)))
	start := max(end-length, ceilTo(floor, step))
	if end-start < int64(minimum) {
		return Window{}, false, nil
	}
	return Window{Start: start, End: end}, true, nil
}

func floorTo(ns, step int64) int64 {
	r := ns % step
	if r < 0 {
		r += step
	}
	return ns - r
}

func ceilTo(ns, step int64) int64 {
	f := floorTo(ns, step)
	if f == ns {
		return ns
	}
	return f + step
}
