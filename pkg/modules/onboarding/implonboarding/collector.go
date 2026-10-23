package implonboarding

import (
	"context"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/fuseone-io/fusescope/pkg/types/onboardingtypes"
)

const collectorProbeTimeout = 2 * time.Second

type collectorProbe struct {
	endpoint string
	client   *http.Client
}

// newCollectorProbe returns nil for an empty endpoint: the backend then knows
// no collector to check.
func newCollectorProbe(endpoint string) *collectorProbe {
	if endpoint == "" {
		return nil
	}

	return &collectorProbe{endpoint: endpoint, client: &http.Client{Timeout: collectorProbeTimeout}}
}

// Check sends a GET to the OTLP/HTTP traces path; the receiver answers 405,
// and any answer means it is reachable.
func (probe *collectorProbe) Check(ctx context.Context) *onboardingtypes.CollectorHealth {
	health := &onboardingtypes.CollectorHealth{Endpoint: probe.endpoint}

	request, err := http.NewRequestWithContext(ctx, http.MethodGet, strings.TrimRight(probe.endpoint, "/")+"/v1/traces", nil)
	if err != nil {
		return health
	}

	response, err := probe.client.Do(request)
	if err != nil {
		return health
	}
	_, _ = io.Copy(io.Discard, response.Body)
	_ = response.Body.Close()

	health.Reachable = true
	return health
}
