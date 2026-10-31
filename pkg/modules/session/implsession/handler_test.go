package implsession

import (
	"crypto/tls"
	"net/http/httptest"
	"net/url"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/fuseone-io/fusescope/pkg/global"
)

func TestHandlerSiteURL(t *testing.T) {
	externalURL, err := url.Parse("https://fusescope.example.com/signoz")
	require.NoError(t, err)

	testCases := []struct {
		name           string
		globalConfig   global.Config
		forwardedProto string
		tls            bool
		want           string
	}{
		{name: "ExternalURL_Wins", globalConfig: global.Config{ExternalURL: externalURL}, want: "https://fusescope.example.com"},
		{name: "UnsetExternalURL_RequestHost", globalConfig: global.Config{ExternalURL: &url.URL{Scheme: "http", Host: "<unset>"}}, want: "http://localhost:8080"},
		{name: "TLS_HTTPS", tls: true, want: "https://localhost:8080"},
		{name: "ForwardedProto_HTTPS", forwardedProto: "https", want: "https://localhost:8080"},
		{name: "ForwardedProtoInvalid_Ignored", forwardedProto: "gopher", want: "http://localhost:8080"},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			req := httptest.NewRequest("GET", "http://localhost:8080/api/v1/saml/metadata", nil)
			if testCase.forwardedProto != "" {
				req.Header.Set("X-Forwarded-Proto", testCase.forwardedProto)
			}
			if testCase.tls {
				req.TLS = &tls.ConnectionState{}
			}

			h := &handler{globalConfig: testCase.globalConfig}
			assert.Equal(t, testCase.want, h.siteURL(req).String())
		})
	}
}
