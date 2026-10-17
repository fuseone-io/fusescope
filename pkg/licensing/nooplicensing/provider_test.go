package nooplicensing

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/fuseone-io/fusescope/pkg/types/licensetypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
)

func TestGetFeatureFlags(t *testing.T) {
	provider := &noopLicensing{}

	features, err := provider.GetFeatureFlags(context.Background(), valuer.GenerateUUID())
	require.NoError(t, err)

	testCases := []struct {
		name           string
		feature        valuer.String
		expectedActive bool
	}{
		{name: "SSO_Active", feature: licensetypes.SSO, expectedActive: true},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			var found *licensetypes.Feature
			for _, feature := range features {
				if feature.Name == testCase.feature {
					found = feature
				}
			}

			require.NotNil(t, found, "feature %s must be reported", testCase.feature)
			assert.Equal(t, testCase.expectedActive, found.Active)
		})
	}
}
