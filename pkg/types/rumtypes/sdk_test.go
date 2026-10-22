package rumtypes

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestSDKSupportOf(t *testing.T) {
	testCases := []struct {
		name     string
		sdkName  string
		version  string
		expected SDKSupport
	}{
		{name: "DistroInRange_Supported", sdkName: SDKBrowserName, version: SupportedSDKMinVersion, expected: SDKSupportSupported},
		{name: "DistroPatchInRange_Supported", sdkName: SDKBrowserName, version: "0.1.7", expected: SDKSupportSupported},
		{name: "DistroBelowRange_Outdated", sdkName: SDKBrowserName, version: "0.0.9", expected: SDKSupportOutdated},
		{name: "DistroAboveRange_Outdated", sdkName: SDKBrowserName, version: SupportedSDKMaxVersion, expected: SDKSupportOutdated},
		{name: "DistroUnparsable_Outdated", sdkName: SDKBrowserName, version: "dev", expected: SDKSupportOutdated},
		{name: "DistroPrerelease_Supported", sdkName: SDKBrowserName, version: "0.2.0-beta.1", expected: SDKSupportSupported},
		{name: "PlainOpenTelemetry_Other", sdkName: "opentelemetry", version: "2.12.0", expected: SDKSupportOther},
		{name: "Nothing_Unknown", sdkName: "", version: "", expected: SDKSupportUnknown},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			assert.Equal(t, testCase.expected, SDKSupportOf(testCase.sdkName, testCase.version))
		})
	}
}
