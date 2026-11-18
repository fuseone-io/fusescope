package rumtypes

import (
	"strconv"
	"strings"

	"github.com/fuseone-io/fusescope/pkg/valuer"
)

// The FuseScope distribution versions this server is tested with, with an
// inclusive minimum and exclusive per-distribution maximum. The name is
// the distribution's telemetry.distro.name.
const (
	SDKBrowserName                = "@fusescope/browser"
	SDKAndroidName                = "io.fuseone.fusescope:android"
	SupportedSDKMinVersion        = "0.1.0"
	SupportedSDKMaxVersion        = "1.0.0"
	SupportedAndroidSDKMaxVersion = "1.1.0"
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

// BundledSDK is the browser bundle this server serves for script-tag installs.
type BundledSDK struct {
	Name      string `json:"name" required:"true"`
	Version   string `json:"version" required:"true"`
	Integrity string `json:"integrity" required:"true" description:"Subresource Integrity value of the script, e.g. sha384-…."`
	Path      string `json:"path" required:"true" description:"Path of the script on this server, without the external path prefix."`
}

func (SDKSupport) Enum() []any {
	return []any{SDKSupportSupported, SDKSupportOutdated, SDKSupportOther, SDKSupportUnknown}
}

func NewSupportedSDKs() []SupportedSDK {
	return []SupportedSDK{
		{Name: SDKBrowserName, MinVersion: SupportedSDKMinVersion, MaxVersion: SupportedSDKMaxVersion},
		{Name: SDKAndroidName, MinVersion: SupportedSDKMinVersion, MaxVersion: SupportedAndroidSDKMaxVersion},
	}
}

func SDKSupportOf(name string, version string) SDKSupport {
	if name == "" {
		return SDKSupportUnknown
	}
	for _, sdk := range NewSupportedSDKs() {
		if sdk.Name != name {
			continue
		}
		current, ok := parseVersion(version)
		if !ok {
			return SDKSupportOutdated
		}
		minimum, _ := parseVersion(sdk.MinVersion)
		maximum, _ := parseVersion(sdk.MaxVersion)
		if compareVersions(current, minimum) >= 0 && compareVersions(current, maximum) < 0 {
			return SDKSupportSupported
		}
		return SDKSupportOutdated
	}
	return SDKSupportOther
}

func parseVersion(version string) ([3]int, bool) {
	core := strings.TrimPrefix(version, "v")
	if suffix := strings.IndexAny(core, "-+"); suffix >= 0 {
		core = core[:suffix]
	}
	parts := strings.Split(core, ".")
	parsed := [3]int{}
	if len(parts) != len(parsed) && len(parts) != len(parsed)+1 {
		return parsed, false
	}
	for i, part := range parts {
		number, err := strconv.Atoi(part)
		if err != nil || number < 0 {
			return parsed, false
		}
		// A fourth numeric component is a build revision, not a compatibility boundary.
		if i < len(parsed) {
			parsed[i] = number
		}
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
