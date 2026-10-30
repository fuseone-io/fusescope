package ratelimit

import (
	"net"
	"net/http"
	"strings"
)

type Limit struct {
	// Requests per second.
	Rate float64 `mapstructure:"rate"`

	Burst int `mapstructure:"burst"`
}

// ClientIP returns the request's remote address, or its first X-Forwarded-For
// address when trustForwardedFor is set. Trust it only behind a proxy that sets it.
func ClientIP(req *http.Request, trustForwardedFor bool) string {
	if trustForwardedFor {
		if forwarded := req.Header.Get("X-Forwarded-For"); forwarded != "" {
			first, _, _ := strings.Cut(forwarded, ",")
			return strings.TrimSpace(first)
		}
	}

	host, _, err := net.SplitHostPort(req.RemoteAddr)
	if err != nil {
		return req.RemoteAddr
	}
	return host
}
