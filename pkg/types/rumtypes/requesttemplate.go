package rumtypes

import (
	"regexp"
	"strings"
)

// IDSegmentPattern matches a path segment that names one object: a number,
// a UUID or a hex digest of at least 16 characters. It is RE2, so ClickHouse
// match() and Go regexp agree on it.
const IDSegmentPattern = `^(?:[0-9]+|[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}|[0-9a-fA-F]{16,})$`

const IDSegmentPlaceholder = ":id"

// URLAuthorityPattern captures the authority after the scheme,
// URLQueryPattern matches the query and fragment and HostPortPattern the port.
const (
	URLAuthorityPattern = `^[a-zA-Z][a-zA-Z0-9+.-]*://([^/?#]*)`
	URLQueryPattern     = `(?s)[?#].*`
	HostPortPattern     = `:[0-9]+$`
)

var (
	idSegment    = regexp.MustCompile(IDSegmentPattern)
	urlAuthority = regexp.MustCompile(URLAuthorityPattern)
	urlQuery     = regexp.MustCompile(URLQueryPattern)
	hostPort     = regexp.MustCompile(HostPortPattern)
)

// RequestTemplate groups fetch and XHR calls to one endpoint.
type RequestTemplate struct {
	Method string `json:"method" required:"true"`
	Host   string `json:"host" required:"true" description:"Host without port; empty for a relative URL."`
	Path   string `json:"path" required:"true" description:"URL path with numeric, UUID and hash segments replaced by :id."`
}

// NewRequestTemplate splits the URL with the exported patterns, which the
// SQL that groups requests by template uses too.
func NewRequestTemplate(method string, rawURL string) RequestTemplate {
	host, path := "", rawURL
	if match := urlAuthority.FindStringSubmatchIndex(rawURL); match != nil {
		host, path = hostPort.ReplaceAllLiteralString(rawURL[match[2]:match[3]], ""), rawURL[match[1]:]
	}
	path = urlQuery.ReplaceAllLiteralString(path, "")

	return RequestTemplate{Method: strings.ToUpper(method), Host: host, Path: TemplatePath(path)}
}

func TemplatePath(path string) string {
	if path == "" {
		return "/"
	}
	segments := strings.Split(path, "/")
	for i, segment := range segments {
		if idSegment.MatchString(segment) {
			segments[i] = IDSegmentPlaceholder
		}
	}
	return strings.Join(segments, "/")
}

func (template RequestTemplate) String() string {
	return template.Method + " " + template.Host + template.Path
}
