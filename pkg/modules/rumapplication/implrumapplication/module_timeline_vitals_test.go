package implrumapplication

import (
	"testing"

	"github.com/fuseone-io/fusescope/pkg/types/rumtypes"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNewLogTimelineEventVitals(t *testing.T) {
	testCases := []struct {
		name string
		row  sessionLogRow
		skip bool
	}{
		{name: "BrowserLCP_PreservesValueAndRating", row: sessionLogRow{event: rumtypes.EventNameWebVital, vitalName: "lcp", vitalValue: 1820, vitalRating: "good"}},
		{name: "AndroidAppStart_PreservesValueAndRating", row: sessionLogRow{event: rumtypes.EventNameLegacyVital, vitalName: "app_start", vitalValue: 2700.5, vitalRating: "needs-improvement"}},
		{name: "UnknownAppVital_Skipped", row: sessionLogRow{event: rumtypes.EventNameLegacyVital, vitalName: "unknown", vitalValue: 15}, skip: true},
		{name: "WebNameInAppNamespace_Skipped", row: sessionLogRow{event: rumtypes.EventNameLegacyVital, vitalName: "cls", vitalValue: 0.2}, skip: true},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			event := newLogTimelineEvent(&testCase.row)
			if testCase.skip {
				assert.Nil(t, event)
				return
			}
			require.NotNil(t, event)
			assert.Equal(t, rumtypes.TimelineEventKindVital, event.Kind)
			require.NotNil(t, event.Vital)
			assert.Equal(t, testCase.row.vitalName, event.Vital.Name.StringValue())
			assert.Equal(t, testCase.row.vitalValue, event.Vital.Value)
			assert.Equal(t, testCase.row.vitalRating, event.Vital.Rating.StringValue())
		})
	}
}

func TestAddSessionEventsAppStartCountsAsVital(t *testing.T) {
	session := &rumtypes.GettableSession{}
	_, events, _ := addSessionEvents(session, nil, []*sessionLogRow{{event: rumtypes.EventNameLegacyVital, vitalName: "app_start", vitalValue: 137.5, vitalRating: "good"}})
	require.Len(t, events, 1)
	assert.EqualValues(t, 1, session.Vitals)
	assert.Zero(t, session.Actions)
	assert.Equal(t, rumtypes.TimelineEventKindVital, events[0].Kind)
}
