package retentiontypes

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestShouldApplyDefaultRetention(t *testing.T) {
	testCases := []struct {
		name          string
		defaultDays   int
		hasTTLSetting bool
		want          bool
	}{
		{name: "DefaultSet_NoTTLSetting_Apply", defaultDays: 3, hasTTLSetting: false, want: true},
		{name: "DefaultSet_TTLSettingExists_Skip", defaultDays: 3, hasTTLSetting: true, want: false},
		{name: "DefaultUnset_NoTTLSetting_Skip", defaultDays: 0, hasTTLSetting: false, want: false},
		{name: "DefaultUnset_TTLSettingExists_Skip", defaultDays: 0, hasTTLSetting: true, want: false},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			assert.Equal(t, testCase.want, ShouldApplyDefaultRetention(testCase.defaultDays, testCase.hasTTLSetting))
		})
	}
}

func TestNewDefaultTTLParams(t *testing.T) {
	testCases := []struct {
		name    string
		ttlType string
		days    int
		want    *TTLParams
	}{
		{name: "Traces_ThreeDaysInSeconds", ttlType: TraceTTL, days: 3, want: &TTLParams{Type: TraceTTL, DelDuration: 259200}},
		{name: "Metrics_ThirtyDaysInSeconds", ttlType: MetricsTTL, days: 30, want: &TTLParams{Type: MetricsTTL, DelDuration: 2592000}},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			assert.Equal(t, testCase.want, NewDefaultTTLParams(testCase.ttlType, testCase.days))
		})
	}
}

func TestNewDefaultCustomRetentionTTLParams(t *testing.T) {
	assert.Equal(t, &CustomRetentionTTLParams{Type: LogsTTL, DefaultTTLDays: 3, TTLConditions: []CustomRetentionRule{}}, NewDefaultCustomRetentionTTLParams(3))
}
