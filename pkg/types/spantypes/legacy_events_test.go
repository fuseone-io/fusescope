package spantypes

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// observedEvents is fusescope-engine's span_events_observed.json: span events as sent over
// OTLP and as the ClickHouse pipeline stored them, for each recorded collector.
type observedEvents struct {
	Runs []struct {
		Source struct {
			Collector string `json:"collector"`
		} `json:"source"`
		Cases []struct {
			Case string `json:"case"`
			Sent struct {
				Events []struct {
					Name       string            `json:"name"`
					Attributes map[string]string `json:"attributes"`
				} `json:"events"`
			} `json:"sent"`
			Row struct {
				Events []json.RawMessage `json:"events"`
			} `json:"row"`
		} `json:"cases"`
	} `json:"runs"`
}

func TestEngineEventsReachTheWaterfallAsClickHouseStoresThem(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join("testdata", "span_events_observed.json"))
	require.NoError(t, err)
	var observed observedEvents
	require.NoError(t, json.Unmarshal(raw, &observed))
	require.Len(t, observed.Runs, 2)

	for _, run := range observed.Runs {
		require.Len(t, run.Cases, 18)
		for _, c := range run.Cases {
			require.Len(t, c.Row.Events, len(c.Sent.Events), c.Case)
			stored := make([]string, 0, len(c.Row.Events))
			native := make([]any, 0, len(c.Sent.Events))
			for i, sent := range c.Sent.Events {
				var at struct {
					TimeUnixNano int64 `json:"timeUnixNano"`
				}
				require.NoError(t, json.Unmarshal(c.Row.Events[i], &at))
				stored = append(stored, string(c.Row.Events[i]))
				native = append(native, map[string]any{
					"timestamp":  time.Unix(0, at.TimeUnixNano).UTC(),
					"name":       sent.Name,
					"attributes": sent.Attributes,
				})
			}

			clickhouse := (&StorableSpan{Events: stored}).ToWaterfallSpan("t").Events
			engine := (&StorableSpan{Events: LegacyEvents(native)}).ToWaterfallSpan("t").Events
			want, err := json.Marshal(clickhouse)
			require.NoError(t, err)
			got, err := json.Marshal(engine)
			require.NoError(t, err)
			assert.JSONEq(t, string(want), string(got), "%s, %s", run.Source.Collector, c.Case)
		}
	}
}
