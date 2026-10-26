package dashboardtypes

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestPublicTimeRangeRejectsInvalidDuration(t *testing.T) {
	for _, raw := range []string{"0s", "-1h", "720h1ms"} {
		t.Run(raw, func(t *testing.T) {
			data := []byte(`{"defaultTimeRange":"` + raw + `"}`)
			var create PostablePublicDashboard
			var update UpdatablePublicDashboard
			assert.Error(t, json.Unmarshal(data, &create))
			assert.Error(t, json.Unmarshal(data, &update))
		})
	}
}

func TestPublicTimeRangeAcceptsThirtyDays(t *testing.T) {
	data := []byte(`{"defaultTimeRange":"720h"}`)
	var create PostablePublicDashboard
	var update UpdatablePublicDashboard
	assert.NoError(t, json.Unmarshal(data, &create))
	assert.NoError(t, json.Unmarshal(data, &update))
}

func TestPublicTimeRangeRejectsReversedBounds(t *testing.T) {
	config := PublicDashboard{TimeRangeEnabled: true}
	_, _, err := config.ResolveTimeRange("2000", "1000")
	assert.Error(t, err)
}
