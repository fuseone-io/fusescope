package ratelimit

import (
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestClientIP(t *testing.T) {
	testCases := []struct {
		name              string
		remoteAddr        string
		forwardedFor      string
		trustForwardedFor bool
		expected          string
	}{
		{name: "RemoteAddr_PortStripped", remoteAddr: "10.0.0.1:5123", expected: "10.0.0.1"},
		{name: "RemoteAddrIPv6_PortStripped", remoteAddr: "[2001:db8::1]:443", expected: "2001:db8::1"},
		{name: "RemoteAddrWithoutPort_Kept", remoteAddr: "10.0.0.2", expected: "10.0.0.2"},
		{name: "ForwardedFor_Untrusted_Ignored", remoteAddr: "10.0.0.3:80", forwardedFor: "203.0.113.7", expected: "10.0.0.3"},
		{name: "ForwardedFor_Trusted_FirstAddress", remoteAddr: "10.0.0.4:80", forwardedFor: " 203.0.113.8 , 10.0.0.9", trustForwardedFor: true, expected: "203.0.113.8"},
		{name: "ForwardedFor_TrustedButMissing_RemoteAddr", remoteAddr: "10.0.0.5:80", trustForwardedFor: true, expected: "10.0.0.5"},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			req := httptest.NewRequest("GET", "/", nil)
			req.RemoteAddr = testCase.remoteAddr
			if testCase.forwardedFor != "" {
				req.Header.Set("X-Forwarded-For", testCase.forwardedFor)
			}

			assert.Equal(t, testCase.expected, ClientIP(req, testCase.trustForwardedFor))
		})
	}
}
