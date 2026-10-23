package onboardingtypes

import (
	"testing"
	"time"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNewStatusQuery(t *testing.T) {
	now := time.Date(2026, 10, 23, 12, 0, 0, 0, time.UTC)

	testCases := []struct {
		name            string
		params          QueryableStatus
		expectedSignals []Signal
		expectedService string
		expectedSince   time.Time
		pass            bool
	}{
		{
			name:            "Defaults_AllSignalsLastHour",
			params:          QueryableStatus{},
			expectedSignals: []Signal{SignalTraces, SignalMetrics, SignalLogs},
			expectedSince:   now.Add(-time.Hour),
			pass:            true,
		},
		{
			name:            "SignalsSubset_OrderedAndDeduplicated",
			params:          QueryableStatus{Signals: " logs,traces,logs ", Service: "checkout"},
			expectedSignals: []Signal{SignalTraces, SignalLogs},
			expectedService: "checkout",
			expectedSince:   now.Add(-time.Hour),
			pass:            true,
		},
		{
			name:            "Since_Honoured",
			params:          QueryableStatus{Since: now.Add(-5 * time.Minute).UnixMilli()},
			expectedSignals: []Signal{SignalTraces, SignalMetrics, SignalLogs},
			expectedSince:   now.Add(-5 * time.Minute),
			pass:            true,
		},
		{
			name:            "SinceOlderThanMax_Raised",
			params:          QueryableStatus{Since: now.Add(-72 * time.Hour).UnixMilli()},
			expectedSignals: []Signal{SignalTraces, SignalMetrics, SignalLogs},
			expectedSince:   now.Add(-MaxStatusWindow),
			pass:            true,
		},
		{name: "UnknownSignal_Rejected", params: QueryableStatus{Signals: "traces,profiles"}},
		{name: "SinceInFuture_Rejected", params: QueryableStatus{Since: now.Add(time.Minute).UnixMilli()}},
		{name: "NegativeSince_Rejected", params: QueryableStatus{Since: -1}},
		{name: "ServiceTooLong_Rejected", params: QueryableStatus{Service: string(make([]byte, 257))}},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			query, err := NewStatusQuery(testCase.params, now)
			if !testCase.pass {
				require.Error(t, err)
				assert.True(t, errors.Ast(err, errors.TypeInvalidInput))
				return
			}
			require.NoError(t, err)
			assert.Equal(t, testCase.expectedSignals, query.Signals)
			assert.Equal(t, testCase.expectedService, query.Service)
			assert.Equal(t, testCase.expectedSince, query.Since)
			assert.Equal(t, now, query.Until)
		})
	}
}

func TestNewSignalStatus(t *testing.T) {
	empty := NewSignalStatus(0, 1761220000000, 1761220005000)
	assert.False(t, empty.Received)
	assert.Zero(t, empty.Count)
	assert.Nil(t, empty.FirstSeen)
	assert.Nil(t, empty.LastSeen)

	received := NewSignalStatus(3, 1761220000000, 1761220005000)
	assert.True(t, received.Received)
	assert.Equal(t, uint64(3), received.Count)
	require.NotNil(t, received.FirstSeen)
	require.NotNil(t, received.LastSeen)
	assert.Equal(t, int64(1761220000000), *received.FirstSeen)
	assert.Equal(t, int64(1761220005000), *received.LastSeen)
}

func TestNewStatus_OnlyRequestedSignals(t *testing.T) {
	now := time.Date(2026, 10, 23, 12, 0, 0, 0, time.UTC)
	query, err := NewStatusQuery(QueryableStatus{Signals: "logs", Service: "api"}, now)
	require.NoError(t, err)

	status := NewStatus(query)
	require.NotNil(t, status.Service)
	assert.Equal(t, "api", *status.Service)
	assert.Equal(t, now.Add(-time.Hour).UnixMilli(), status.Since)
	assert.Equal(t, now.UnixMilli(), status.Until)
	assert.Nil(t, status.Traces)
	assert.Nil(t, status.Metrics)
	assert.Nil(t, status.Logs)

	status = NewStatus(StatusQuery{Since: now, Until: now})
	assert.Nil(t, status.Service)
}
