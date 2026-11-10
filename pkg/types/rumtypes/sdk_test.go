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
		{name: "AndroidDistroInRange_Supported", sdkName: SDKAndroidName, version: "0.3.0", expected: SDKSupportSupported},
		{name: "AndroidStableRelease_Supported", sdkName: SDKAndroidName, version: "1.0.0", expected: SDKSupportSupported},
		{name: "AndroidStablePatch_Supported", sdkName: SDKAndroidName, version: "1.0.7", expected: SDKSupportSupported},
		{name: "AndroidNextMinor_Outdated", sdkName: SDKAndroidName, version: "1.1.0", expected: SDKSupportOutdated},
		{name: "AndroidBelowRange_Outdated", sdkName: SDKAndroidName, version: "0.0.8", expected: SDKSupportOutdated},
		{name: "AndroidInvalidVersion_Outdated", sdkName: SDKAndroidName, version: "invalid", expected: SDKSupportOutdated},
		{name: "AndroidMavenCoordinates_Supported", sdkName: "io.fuseone.fusescope:android", version: "0.3.0", expected: SDKSupportSupported},
		{name: "AndroidOldCoordinates_Other", sdkName: "io.fusescope:android", version: "0.3.0", expected: SDKSupportOther},
		{name: "PlainOpenTelemetry_Other", sdkName: "opentelemetry", version: "2.12.0", expected: SDKSupportOther},
		{name: "Nothing_Unknown", sdkName: "", version: "", expected: SDKSupportUnknown},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			assert.Equal(t, testCase.expected, SDKSupportOf(testCase.sdkName, testCase.version))
		})
	}
}

func TestNewSupportedSDKs(t *testing.T) {
	names := []string{}
	for _, sdk := range NewSupportedSDKs() {
		names = append(names, sdk.Name)
	}
	assert.Equal(t, []string{SDKBrowserName, SDKAndroidName}, names)
}

func TestSupportedSDKMetadataMatchesClassification(t *testing.T) {
	for _, sdk := range NewSupportedSDKs() {
		t.Run(sdk.Name, func(t *testing.T) {
			assert.Equal(t, SDKSupportSupported, SDKSupportOf(sdk.Name, sdk.MinVersion))
			assert.Equal(t, SDKSupportOutdated, SDKSupportOf(sdk.Name, sdk.MaxVersion))
			expectedMax := "1.0.0"
			if sdk.Name == SDKAndroidName {
				expectedMax = "1.1.0"
			}
			assert.Equal(t, expectedMax, sdk.MaxVersion)
		})
	}
}
