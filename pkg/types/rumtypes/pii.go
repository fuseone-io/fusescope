package rumtypes

import (
	"net/url"
	"slices"
	"strings"
)

// URLAttributes are the span, log and resource attributes the gateway scrubs.
var URLAttributes = []string{"url.full", "http.url", "http.target", "url.original", "location.href", "page.url"}

const (
	QueryAttribute    = "url.query"
	FragmentAttribute = "url.fragment"
)

// PIIPolicy decides what URLs keep. The fragment is always dropped unless the
// URL starts with an entry of URLAllowlist, which keeps the URL verbatim.
type PIIPolicy struct {
	DropQuery      bool     `json:"dropQuery" required:"true" description:"Drop query parameters that are not in queryAllowlist."`
	QueryAllowlist []string `json:"queryAllowlist" required:"true" description:"Query parameter names kept when dropQuery is true."`
	URLAllowlist   []string `json:"urlAllowlist" required:"true" description:"URL prefixes kept verbatim, query and fragment included."`
	GeoLookup      bool     `json:"geoLookup" required:"true" description:"Derive the country from the client IP. The IP itself is never stored."`
	RequireConsent bool     `json:"requireConsent" required:"true" description:"The SDK starts only after the consent hook allows it."`
	HashUserID     bool     `json:"hashUserId" required:"true" description:"The SDK hashes the id passed to setUser()."`
}

func NewDefaultPIIPolicy() PIIPolicy {
	return PIIPolicy{DropQuery: true, QueryAllowlist: []string{}, URLAllowlist: []string{}}
}

func (policy PIIPolicy) ScrubURL(raw string) string {
	cut := strings.IndexAny(raw, "?#")
	if cut < 0 {
		return raw
	}

	base := raw[:cut]
	for _, prefix := range policy.URLAllowlist {
		if strings.HasPrefix(base, prefix) {
			return raw
		}
	}

	if raw[cut] == '#' {
		return base
	}

	query := raw[cut+1:]
	if hash := strings.IndexByte(query, '#'); hash >= 0 {
		query = query[:hash]
	}

	if kept := policy.ScrubQuery(query); kept != "" {
		return base + "?" + kept
	}

	return base
}

// ScrubQuery filters a raw query string, keeping the original encoding of the
// parameters it keeps.
func (policy PIIPolicy) ScrubQuery(query string) string {
	query = strings.TrimPrefix(query, "?")
	if !policy.DropQuery {
		return query
	}

	kept := []string{}
	for _, param := range strings.Split(query, "&") {
		name, _, _ := strings.Cut(param, "=")
		if decoded, err := url.QueryUnescape(name); err == nil {
			name = decoded
		}
		if name != "" && slices.Contains(policy.QueryAllowlist, name) {
			kept = append(kept, param)
		}
	}

	return strings.Join(kept, "&")
}

// ScrubSpanName scrubs every space-separated token that carries a query or a
// fragment, e.g. "Navigation: /customers/392#tab?email=a@b.c".
func (policy PIIPolicy) ScrubSpanName(name string) string {
	if !strings.ContainsAny(name, "?#") {
		return name
	}

	tokens := strings.Split(name, " ")
	for i, token := range tokens {
		tokens[i] = policy.ScrubURL(token)
	}

	return strings.Join(tokens, " ")
}

func (policy *PIIPolicy) normalize() {
	if policy.QueryAllowlist == nil {
		policy.QueryAllowlist = []string{}
	}
	if policy.URLAllowlist == nil {
		policy.URLAllowlist = []string{}
	}
}
