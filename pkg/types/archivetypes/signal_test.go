package archivetypes

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

func TestSignalBackstopPending(t *testing.T) {
	applied := time.Date(2026, 10, 24, 0, 0, 0, 0, time.UTC)

	testCases := []struct {
		name   string
		signal *Signal
		days   int
		want   bool
	}{
		{name: "NoRow_Pending", signal: nil, days: 7, want: true},
		{name: "NeverApplied_Pending", signal: &Signal{BackstopDays: 7}, days: 7, want: true},
		{name: "AppliedSameDays_NotPending", signal: &Signal{BackstopDays: 7, AppliedAt: &applied}, days: 7, want: false},
		{name: "AppliedOtherDays_Pending", signal: &Signal{BackstopDays: 7, AppliedAt: &applied}, days: 10, want: true},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			assert.Equal(t, testCase.want, testCase.signal.BackstopPending(testCase.days))
		})
	}
}
