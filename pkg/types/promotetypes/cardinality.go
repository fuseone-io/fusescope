package promotetypes

import (
	"regexp"
	"strings"
)

const (
	minCardinalHexLength    = 16
	minCardinalDigitsLength = 10
	jwtHeaderPrefix         = "eyJ"
)

var (
	// '/' is allowed for Kubernetes label and annotation keys (app.kubernetes.io/name).
	// ':' and '@' are excluded: attribute keys do not use them, addresses and emails do.
	keySegmentRe = regexp.MustCompile(`^[A-Za-z0-9_/-]*$`)
	uuidRe       = regexp.MustCompile(`^\{?[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}\}?$`)
	hexRe        = regexp.MustCompile(`^[0-9A-Fa-f]+$`)
	digitsRe     = regexp.MustCompile(`^[0-9]+$`)
	base64URLRe  = regexp.MustCompile(`^[A-Za-z0-9_-]+$`)
)

// isCardinalPath reports whether any dot-separated segment of path looks like
// a per-entity value (UUID, long hex or number, JWT, free text) rather than a
// key name, so promoting it would create an unbounded set of columns.
func isCardinalPath(path string) bool {
	segments := strings.Split(path, ".")
	for idx, segment := range segments {
		if isCardinalSegment(segment) || isJWTAt(segments, idx) {
			return true
		}
	}
	return false
}

func isCardinalSegment(segment string) bool {
	switch {
	case uuidRe.MatchString(segment):
		return true
	case !keySegmentRe.MatchString(segment):
		return true
	case len(segment) >= minCardinalHexLength && hexRe.MatchString(segment):
		return true
	case len(segment) >= minCardinalDigitsLength && digitsRe.MatchString(segment):
		return true
	}
	return false
}

// isJWTAt checks the three segments starting at idx, since splitting by '.'
// also splits a JWT into its header, payload and signature.
func isJWTAt(segments []string, idx int) bool {
	if idx+3 > len(segments) || !strings.HasPrefix(segments[idx], jwtHeaderPrefix) {
		return false
	}
	for _, part := range segments[idx : idx+3] {
		if !base64URLRe.MatchString(part) {
			return false
		}
	}
	return true
}
