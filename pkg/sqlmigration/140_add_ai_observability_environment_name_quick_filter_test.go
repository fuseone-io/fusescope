package sqlmigration

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestAddEnvironmentNameQuickFilter(t *testing.T) {
	testCases := []struct {
		name            string
		filter          string
		expected        string
		expectedChanged bool
		expectedOK      bool
	}{
		{
			name:            "LegacyPresent_NameInsertedBefore",
			filter:          `[{"name":"deployment.environment","signal":"","fieldContext":"resource","fieldDataType":"string"},{"name":"service.name","signal":"","fieldContext":"resource","fieldDataType":"string"}]`,
			expected:        `[{"name":"deployment.environment.name","signal":"","fieldContext":"resource","fieldDataType":"string"},{"name":"deployment.environment","signal":"","fieldContext":"resource","fieldDataType":"string"},{"name":"service.name","signal":"","fieldContext":"resource","fieldDataType":"string"}]`,
			expectedChanged: true,
			expectedOK:      true,
		},
		{
			name:            "LegacyNotFirst_NameInsertedAtLegacyPosition",
			filter:          `[{"name":"gen_ai.request.model","signal":"","fieldContext":"attribute","fieldDataType":"string"},{"name":"deployment.environment","signal":"","fieldContext":"resource","fieldDataType":"string"}]`,
			expected:        `[{"name":"gen_ai.request.model","signal":"","fieldContext":"attribute","fieldDataType":"string"},{"name":"deployment.environment.name","signal":"","fieldContext":"resource","fieldDataType":"string"},{"name":"deployment.environment","signal":"","fieldContext":"resource","fieldDataType":"string"}]`,
			expectedChanged: true,
			expectedOK:      true,
		},
		{
			name:            "NameAlreadyPresent_Unchanged",
			filter:          `[{"name":"deployment.environment","signal":"","fieldContext":"resource","fieldDataType":"string"},{"name":"deployment.environment.name","signal":"","fieldContext":"resource","fieldDataType":"string"}]`,
			expectedChanged: false,
			expectedOK:      true,
		},
		{
			name:            "LegacyRemovedByUser_Unchanged",
			filter:          `[{"name":"service.name","signal":"","fieldContext":"resource","fieldDataType":"string"}]`,
			expectedChanged: false,
			expectedOK:      true,
		},
		{
			name:            "Unparseable_NotOK",
			filter:          `not json`,
			expectedChanged: false,
			expectedOK:      false,
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			got, changed, ok := addEnvironmentNameQuickFilter(testCase.filter)
			assert.Equal(t, testCase.expectedOK, ok)
			assert.Equal(t, testCase.expectedChanged, changed)
			assert.Equal(t, testCase.expected, got)
		})
	}
}
