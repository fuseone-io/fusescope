package parity

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func instant(ns int64) time.Time { return time.Unix(0, ns) }

var longRetention = Retention{ClickHouse: 30 * 24 * time.Hour, Engine: 7 * 24 * time.Hour}

func plan(t *testing.T, class WindowClass, now, epoch int64, retention Retention) (Window, bool) {
	t.Helper()
	w, ok, err := PlanWindow(DefaultWindowConfig(), class, instant(now), instant(epoch), retention)
	require.NoError(t, err)
	return w, ok
}

func TestTheSettledWindowEndsAMarginBeforeNow(t *testing.T) {
	now := at(90) + int64(30*time.Second)
	w, ok := plan(t, Settled, now, 0, longRetention)
	assert.True(t, ok)
	assert.Equal(t, span(15, 75), w, "an hour ending at the minute 15 minutes before now")
}

func TestTheRecentWindowIsTheLastFiveWholeMinutes(t *testing.T) {
	now := at(90) + int64(30*time.Second)
	w, ok := plan(t, Recent, now, 0, longRetention)
	assert.True(t, ok)
	assert.Equal(t, span(85, 90), w)
}

func TestAWindowStartsAfterTheDualWriteEpoch(t *testing.T) {
	now := at(90)
	w, ok := plan(t, Settled, now, at(40)+int64(10*time.Second), longRetention)
	assert.True(t, ok)
	assert.Equal(t, span(41, 75), w, "the first whole minute written to both stores")

	_, ok = plan(t, Settled, now, at(50), longRetention)
	assert.False(t, ok, "25 minutes are under the 30 a settled window needs")

	_, ok = plan(t, Recent, now, at(87), longRetention)
	assert.False(t, ok, "a recent window needs its 5 minutes")
}

func TestAWindowStartsWithinTheShorterRetention(t *testing.T) {
	now := at(90) + int64(30*time.Second)
	w, ok := plan(t, Settled, now, 0, Retention{ClickHouse: 30 * 24 * time.Hour, Engine: time.Hour})
	assert.True(t, ok)
	assert.Equal(t, span(31, 75), w)

	w, ok = plan(t, Settled, now, 0, Retention{ClickHouse: time.Hour, Engine: 30 * 24 * time.Hour})
	assert.True(t, ok)
	assert.Equal(t, span(31, 75), w, "whichever store keeps less")
}

func TestPlanningRefusesAConfigurationItCannotHonour(t *testing.T) {
	bad := map[string]func(*WindowConfig){
		"no step":                   func(c *WindowConfig) { c.Step = 0 },
		"margin off the step":       func(c *WindowConfig) { c.SettledMargin = 90 * time.Second },
		"settled under its minimum": func(c *WindowConfig) { c.SettledLength = 20 * time.Minute },
		"recent under its minimum":  func(c *WindowConfig) { c.RecentLength = 4 * time.Minute },
		"no minimum":                func(c *WindowConfig) { c.MinRecent = 0 },
	}
	for name, mutate := range bad {
		cfg := DefaultWindowConfig()
		mutate(&cfg)
		_, _, err := PlanWindow(cfg, Settled, instant(at(90)), instant(0), longRetention)
		assert.Error(t, err, name)
	}
	_, _, err := PlanWindow(DefaultWindowConfig(), Settled, instant(at(90)), instant(0), Retention{ClickHouse: time.Hour})
	assert.Error(t, err, "a store without a retention")
	_, _, err = PlanWindow(DefaultWindowConfig(), "warm", instant(at(90)), instant(0), longRetention)
	assert.Error(t, err)
}
