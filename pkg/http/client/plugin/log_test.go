package plugin

import (
	"bytes"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestOnRequestStartRedactsSensitiveHeaders(t *testing.T) {
	testCases := []struct {
		name  string
		level slog.Level
	}{
		{name: "InfoLevel", level: slog.LevelInfo},
		{name: "DebugLevel", level: slog.LevelDebug},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			buffer := &bytes.Buffer{}
			logger := slog.New(slog.NewTextHandler(buffer, &slog.HandlerOptions{Level: testCase.level}))

			request := httptest.NewRequest(http.MethodGet, "https://example.com/v1/data", nil)
			request.Header.Set("Authorization", "Bearer secret-bearer-token")
			request.Header.Set("Proxy-Authorization", "Basic secret-proxy-credentials")
			request.Header.Set("Cookie", "session=secret-cookie")
			request.Header.Set("Signoz-Api-Key", "secret-api-key")
			request.Header.Set("X-Signoz-Cloud-Api-Key", "secret-cloud-api-key")
			request.Header.Set("Accept", "application/json")

			NewLog(logger).OnRequestStart(request)

			output := buffer.String()
			for _, secret := range []string{"secret-bearer-token", "secret-proxy-credentials", "secret-cookie", "secret-api-key", "secret-cloud-api-key"} {
				assert.NotContains(t, output, secret)
			}
			assert.Contains(t, output, "REDACTED")
			assert.Contains(t, output, "application/json")
		})
	}
}
