package archivetypes

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

func TestBackstopTableDone(t *testing.T) {
	now := time.Now()
	testCases := []struct {
		name     string
		progress *BackstopTable
		days     int
		want     bool
	}{
		{name: "None_NotDone", days: 7},
		{name: "Modified_NotDone", progress: &BackstopTable{BackstopDays: 7, ModifiedAt: &now}, days: 7},
		{name: "Materialized_Done", progress: &BackstopTable{BackstopDays: 7, ModifiedAt: &now, MaterializedAt: &now}, days: 7, want: true},
		{name: "MaterializedOtherDays_NotDone", progress: &BackstopTable{BackstopDays: 10, ModifiedAt: &now, MaterializedAt: &now}, days: 7},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			assert.Equal(t, testCase.want, testCase.progress.Done(testCase.days))
		})
	}
}
