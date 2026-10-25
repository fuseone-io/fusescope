package rumtypes

import (
	"strconv"
	"strings"

	"github.com/fuseone-io/fusescope/pkg/valuer"
)

// The FuseScope distribution versions this server is tested with, the same
// range for each: SupportedSDKMinVersion included, SupportedSDKMaxVersion
// excluded. The name is the distribution's telemetry.distro.name.
const (
	SDKBrowserName         = "@fusescope/browser"
	SDKAndroidName         = "io.fuseone.fusescope:android"
	SupportedSDKMinVersion = "0.1.0"
	SupportedSDKMaxVersion = "1.0.0"
)

var (
	SDKSupportSupported = SDKSupport{valuer.NewString("supported")}
	SDKSupportOutdated  = SDKSupport{valuer.NewString("outdated")}
	SDKSupportOther     = SDKSupport{valuer.NewString("other")}
	SDKSupportUnknown   = SDKSupport{valuer.NewString("unknown")}
)

// SDKSupport classifies the client seen by the gateway: our distribution in
// the supported range, our distribution outside it, any other OTLP client, or
// nothing seen yet.
type SDKSupport struct{ valuer.String }

type SupportedSDK struct {
	Name       string `json:"name" required:"true"`
	MinVersion string `json:"minVersion" required:"true" description:"Inclusive."`
	MaxVersion string `json:"maxVersion" required:"true" description:"Exclusive."`
}

func (SDKSupport) Enum() []any {
	return []any{SDKSupportSupported, SDKSupportOutdated, SDKSupportOther, SDKSupportUnknown}
}

func NewSupportedSDKs() []SupportedSDK {
	return []SupportedSDK{
		{Name: SDKBrowserName, MinVersion: SupportedSDKMinVersion, MaxVersion: SupportedSDKMaxVersion},
		{Name: SDKAndroidName, MinVersion: SupportedSDKMinVersion, MaxVersion: SupportedSDKMaxVersion},
	}
}

func SDKSupportOf(name string, version string) SDKSupport {
	switch name {
	case "":
		return SDKSupportUnknown
	case SDKBrowserName, SDKAndroidName:
		current, ok := parseVersion(version)
		if !ok {
			return SDKSupportOutdated
		}
		minimum, _ := parseVersion(SupportedSDKMinVersion)
		maximum, _ := parseVersion(SupportedSDKMaxVersion)
		if compareVersions(current, minimum) >= 0 && compareVersions(current, maximum) < 0 {
			return SDKSupportSupported
		}
		return SDKSupportOutdated
	}
	return SDKSupportOther
}

func parseVersion(version string) ([3]int, bool) {
	core, _, _ := strings.Cut(strings.TrimPrefix(version, "v"), "-")
	parts := strings.Split(core, ".")
	parsed := [3]int{}
	if len(parts) != len(parsed) {
		return parsed, false
	}
	for i, part := range parts {
		number, err := strconv.Atoi(part)
		if err != nil || number < 0 {
			return parsed, false
		}
		parsed[i] = number
	}
	return parsed, true
}

func compareVersions(left [3]int, right [3]int) int {
	for i := range left {
		if left[i] != right[i] {
			if left[i] < right[i] {
				return -1
			}
			return 1
		}
	}
	return 0
}
