package dashboardtypes

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestPublicTimeRangeRejectsNonPositiveDuration(t *testing.T) {
	for _, raw := range []string{"0s", "-1h"} {
		t.Run(raw, func(t *testing.T) {
			data := []byte(`{"defaultTimeRange":"` + raw + `"}`)
			var create PostablePublicDashboard
			var update UpdatablePublicDashboard
			assert.Error(t, json.Unmarshal(data, &create))
			assert.Error(t, json.Unmarshal(data, &update))
		})
	}
}

func TestPublicTimeRangeRejectsReversedBounds(t *testing.T) {
	config := PublicDashboard{TimeRangeEnabled: true}
	_, _, err := config.ResolveTimeRange("2000", "1000")
	assert.Error(t, err)
}
