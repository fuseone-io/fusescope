package impldashboard

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/factory/factorytest"
	"github.com/fuseone-io/fusescope/pkg/modules/dashboard"
	"github.com/fuseone-io/fusescope/pkg/ratelimit"
	"github.com/fuseone-io/fusescope/pkg/types/dashboardtypes"
	"github.com/gorilla/mux"
	"github.com/stretchr/testify/assert"
)

type publicRequest struct {
	link         string
	remoteAddr   string
	forwardedFor string
}

func TestCheckPublicRateLimit(t *testing.T) {
	testCases := []struct {
		name              string
		limits            dashboard.PublicRateLimitConfig
		trustForwardedFor bool
		requests          []publicRequest
		allowed           []bool
	}{
		{
			name:   "ClientBurstExceeded_Limited",
			limits: dashboard.PublicRateLimitConfig{Link: ratelimit.Limit{Rate: 0.001, Burst: 10}, Client: ratelimit.Limit{Rate: 0.001, Burst: 2}},
			requests: []publicRequest{
				{link: "link-a", remoteAddr: "10.0.0.1:1000"},
				{link: "link-b", remoteAddr: "10.0.0.1:1001"},
				{link: "link-a", remoteAddr: "10.0.0.1:1002"},
				{link: "link-a", remoteAddr: "10.0.0.2:1000"},
			},
			allowed: []bool{true, true, false, true},
		},
		{
			name:   "LinkBurstExceeded_Limited",
			limits: dashboard.PublicRateLimitConfig{Link: ratelimit.Limit{Rate: 0.001, Burst: 2}, Client: ratelimit.Limit{Rate: 0.001, Burst: 10}},
			requests: []publicRequest{
				{link: "link-c", remoteAddr: "10.0.1.1:1000"},
				{link: "link-c", remoteAddr: "10.0.1.2:1000"},
				{link: "link-c", remoteAddr: "10.0.1.3:1000"},
				{link: "link-d", remoteAddr: "10.0.1.3:1000"},
			},
			allowed: []bool{true, true, false, true},
		},
		{
			name:              "ForwardedForTrusted_KeyedByForwardedAddress",
			limits:            dashboard.PublicRateLimitConfig{Link: ratelimit.Limit{Rate: 0.001, Burst: 10}, Client: ratelimit.Limit{Rate: 0.001, Burst: 1}},
			trustForwardedFor: true,
			requests: []publicRequest{
				{link: "link-e", remoteAddr: "10.0.2.1:1000", forwardedFor: "203.0.113.1"},
				{link: "link-e", remoteAddr: "10.0.2.1:1000", forwardedFor: "203.0.113.2"},
				{link: "link-e", remoteAddr: "10.0.2.1:1000", forwardedFor: "203.0.113.1"},
			},
			allowed: []bool{true, true, false},
		},
		{
			name:   "ForwardedForUntrusted_KeyedByRemoteAddress",
			limits: dashboard.PublicRateLimitConfig{Link: ratelimit.Limit{Rate: 0.001, Burst: 10}, Client: ratelimit.Limit{Rate: 0.001, Burst: 1}},
			requests: []publicRequest{
				{link: "link-f", remoteAddr: "10.0.3.1:1000", forwardedFor: "203.0.113.3"},
				{link: "link-f", remoteAddr: "10.0.3.1:1000", forwardedFor: "203.0.113.4"},
			},
			allowed: []bool{true, false},
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			handler := NewHandler(nil, factorytest.NewSettings(), nil, testCase.limits, testCase.trustForwardedFor)

			for i, request := range testCase.requests {
				req := httptest.NewRequest(http.MethodGet, "/api/v2/public/dashboards/"+request.link, nil)
				req = mux.SetURLVars(req, map[string]string{"id": request.link})
				req.RemoteAddr = request.remoteAddr
				if request.forwardedFor != "" {
					req.Header.Set("X-Forwarded-For", request.forwardedFor)
				}

				err := handler.CheckPublicRateLimit(req)

				if testCase.allowed[i] {
					assert.NoError(t, err, "request %d", i)
					continue
				}
				assert.True(t, errors.Ast(err, errors.TypeTooManyRequests), "request %d", i)
				assert.True(t, errors.Asc(err, dashboardtypes.ErrCodePublicDashboardRateLimited), "request %d", i)
			}
		})
	}
}
