package impldashboard

import (
	"net/http"
	"time"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/modules/dashboard"
	"github.com/fuseone-io/fusescope/pkg/ratelimit"
	"github.com/fuseone-io/fusescope/pkg/types/dashboardtypes"
	"github.com/gorilla/mux"
)

type publicRateLimiter struct {
	link              *ratelimit.Limiter
	client            *ratelimit.Limiter
	trustForwardedFor bool
}

func newPublicRateLimiter(config dashboard.PublicRateLimitConfig, trustForwardedFor bool) *publicRateLimiter {
	return &publicRateLimiter{link: ratelimit.NewLimiter(config.Link), client: ratelimit.NewLimiter(config.Client), trustForwardedFor: trustForwardedFor}
}

// CheckPublicRateLimit checks the client bucket before the link bucket, so a
// client over its limit, e.g. one spraying unknown links, creates no link buckets.
func (handler *handler) CheckPublicRateLimit(req *http.Request) error {
	limiter := handler.publicLimiter
	now := time.Now()
	if !limiter.client.Allow(ratelimit.ClientIP(req, limiter.trustForwardedFor), now) || !limiter.link.Allow(mux.Vars(req)["id"], now) {
		return errors.New(errors.TypeTooManyRequests, dashboardtypes.ErrCodePublicDashboardRateLimited, "rate limit exceeded").WithRetryAfter(time.Second)
	}
	return nil
}
