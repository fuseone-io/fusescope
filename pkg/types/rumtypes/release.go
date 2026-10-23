package rumtypes

import (
	"cmp"
	"regexp"
	"strconv"
	"strings"
)

var releaseVersionPattern = regexp.MustCompile(`^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$`)

type releaseVersion struct {
	core       [3]uint64
	prerelease []string
}

// CompareReleases orders releases oldest first: semantic versions by
// precedence (a missing minor or patch is 0, build metadata is ignored), and
// any other release by text, below every semantic version.
func CompareReleases(a string, b string) int {
	versionA, okA := parseReleaseVersion(a)
	versionB, okB := parseReleaseVersion(b)
	switch {
	case okA && okB:
		if order := compareReleaseVersions(versionA, versionB); order != 0 {
			return order
		}
		return strings.Compare(a, b)
	case okA:
		return 1
	case okB:
		return -1
	default:
		return strings.Compare(a, b)
	}
}

func parseReleaseVersion(release string) (releaseVersion, bool) {
	match := releaseVersionPattern.FindStringSubmatch(release)
	if match == nil {
		return releaseVersion{}, false
	}
	version := releaseVersion{}
	for index, part := range match[1:4] {
		if part == "" {
			continue
		}
		number, err := strconv.ParseUint(part, 10, 64)
		if err != nil {
			return releaseVersion{}, false
		}
		version.core[index] = number
	}
	if match[4] != "" {
		version.prerelease = strings.Split(match[4], ".")
	}
	return version, true
}

func compareReleaseVersions(a releaseVersion, b releaseVersion) int {
	for index := range a.core {
		if order := cmp.Compare(a.core[index], b.core[index]); order != 0 {
			return order
		}
	}
	switch {
	case len(a.prerelease) == 0 && len(b.prerelease) == 0:
		return 0
	case len(a.prerelease) == 0:
		return 1
	case len(b.prerelease) == 0:
		return -1
	}
	for index := 0; index < min(len(a.prerelease), len(b.prerelease)); index++ {
		if order := comparePrereleaseIdentifiers(a.prerelease[index], b.prerelease[index]); order != 0 {
			return order
		}
	}
	return cmp.Compare(len(a.prerelease), len(b.prerelease))
}

func comparePrereleaseIdentifiers(a string, b string) int {
	numberA, errA := strconv.ParseUint(a, 10, 64)
	numberB, errB := strconv.ParseUint(b, 10, 64)
	switch {
	case errA == nil && errB == nil:
		return cmp.Compare(numberA, numberB)
	case errA == nil:
		return -1
	case errB == nil:
		return 1
	default:
		return strings.Compare(a, b)
	}
}
