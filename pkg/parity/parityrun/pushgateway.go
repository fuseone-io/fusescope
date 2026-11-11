package parityrun

import (
	"context"
	"net/http"
	"net/url"
	"os"
	"strings"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/push"

	"github.com/fuseone-io/fusescope/pkg/errors"
)

var ErrCodePushgateway = errors.MustNewCode("parity_pushgateway")

// pushJob is the one group a round's metrics are pushed under: it names no tenant, run or
// parameter, so each round replaces the last and push_time_seconds shows a stale one.
const pushJob = "fusescope_parity"

// Pushgateway pushes a round's metrics to a Pushgateway over TLS, with a bearer token read from its
// file on every push so a rotated token is picked up.
type Pushgateway struct {
	url       string
	tokenFile string
	client    *http.Client
}

// NewPushgateway is a pusher to the Pushgateway at rawURL; client may be nil for the default.
//
// # Errors
//
// A URL that is not https, or no token file.
func NewPushgateway(rawURL, tokenFile string, client *http.Client) (Pushgateway, error) {
	u, err := url.Parse(rawURL)
	if err != nil || u.Scheme != "https" || u.Host == "" {
		return Pushgateway{}, errors.Newf(errors.TypeInvalidInput, ErrCodePushgateway, "the Pushgateway is reached over https only")
	}
	if tokenFile == "" {
		return Pushgateway{}, errors.Newf(errors.TypeInvalidInput, ErrCodePushgateway, "the Pushgateway needs a token file")
	}
	if client == nil {
		client = http.DefaultClient
	}
	return Pushgateway{url: rawURL, tokenFile: tokenFile, client: client}, nil
}

// Push replaces the round's group with registry.
//
// # Errors
//
// An unreadable token, or a push the Pushgateway did not accept.
func (p Pushgateway) Push(ctx context.Context, registry *prometheus.Registry) error {
	token, err := os.ReadFile(p.tokenFile)
	if err != nil {
		return errors.WrapInternalf(err, ErrCodePushgateway, "error reading the Pushgateway token")
	}
	header := http.Header{}
	header.Set("Authorization", "Bearer "+strings.TrimSpace(string(token)))
	if err := push.New(p.url, pushJob).Gatherer(registry).Client(p.client).Header(header).PushContext(ctx); err != nil {
		return errors.WrapInternalf(err, ErrCodePushgateway, "error pushing the round's metrics")
	}
	return nil
}
