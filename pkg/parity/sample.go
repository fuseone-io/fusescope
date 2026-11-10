package parity

import (
	"bytes"
	"crypto/sha256"
	"encoding/binary"
	"slices"

	"github.com/fuseone-io/fusescope/pkg/errors"
)

var ErrCodeSample = errors.MustNewCode("parity_sample")

// Seed makes a round's sample reproducible: the same seed, window and data give the same
// parameters, so a report needs no tenant ids to be replayed.
type Seed uint64

// TraceQuota is how many traces a tenant contributes and how many of them are of each kind; the
// rest are random.
type TraceQuota struct {
	Total        int
	AboveMaxRows int
	Largest      int
	WithError    int
	Windowed     int
}

// SampleConfig caps the services per tenant, the operations per service and the traces per tenant.
type SampleConfig struct {
	Services   int
	Operations int
	Traces     TraceQuota
}

// DefaultSampleConfig is the design's: 20 services, 5 operations and 30 traces.
func DefaultSampleConfig() SampleConfig {
	return SampleConfig{
		Services:   20,
		Operations: 5,
		Traces:     TraceQuota{Total: 30, AboveMaxRows: 2, Largest: 3, WithError: 5, Windowed: 3},
	}
}

// Sampler picks a round's parameters. Every pick is an order by a hash of the seed, the window and
// the item, so it does not depend on the order the stores return the data in, and it rotates from
// one window to the next.
type Sampler struct {
	seed   Seed
	window Window
	cfg    SampleConfig
}

// NewSampler is a sampler for one round.
//
// # Errors
//
// An empty window, a cap that is not positive or quotas that do not fit the total.
func NewSampler(seed Seed, window Window, cfg SampleConfig) (Sampler, error) {
	q := cfg.Traces
	if window.Start >= window.End {
		return Sampler{}, errors.Newf(errors.TypeInvalidInput, ErrCodeSample, "the window is empty")
	}
	if cfg.Services <= 0 || cfg.Operations <= 0 || q.Total <= 0 {
		return Sampler{}, errors.Newf(errors.TypeInvalidInput, ErrCodeSample, "the caps must be positive")
	}
	if min(q.AboveMaxRows, q.Largest, q.WithError, q.Windowed) < 0 || q.AboveMaxRows+q.Largest+q.WithError+q.Windowed > q.Total {
		return Sampler{}, errors.Newf(errors.TypeInvalidInput, ErrCodeSample, "the trace quotas must be non-negative and fit the total")
	}
	return Sampler{seed: seed, window: window, cfg: cfg}, nil
}

func (s Sampler) rank(domain, tenant, scope, id string) []byte {
	h := sha256.New()
	var head [24]byte
	binary.BigEndian.PutUint64(head[0:], uint64(s.seed))
	binary.BigEndian.PutUint64(head[8:], uint64(s.window.Start))
	binary.BigEndian.PutUint64(head[16:], uint64(s.window.End))
	h.Write(head[:])
	for _, part := range []string{domain, tenant, scope, id} {
		h.Write([]byte(part))
		h.Write([]byte{0})
	}
	return h.Sum(nil)
}

// ranked is items without repeats, in the order of their ranks.
func (s Sampler) ranked(domain, tenant, scope string, items []string) []string {
	out := slices.Clone(items)
	slices.Sort(out)
	out = slices.Compact(out)
	ranks := make(map[string][]byte, len(out))
	for _, item := range out {
		ranks[item] = s.rank(domain, tenant, scope, item)
	}
	slices.SortFunc(out, func(a, b string) int { return bytes.Compare(ranks[a], ranks[b]) })
	return out
}

// Services is up to the cap of a tenant's services, from the ClickHouse services view.
func (s Sampler) Services(tenant string, services []string) []string {
	out := s.ranked("service", tenant, "", services)
	return out[:min(len(out), s.cfg.Services)]
}

// Operations is up to the cap of a service's operations.
func (s Sampler) Operations(tenant, service string, operations []string) []string {
	out := s.ranked("operation", tenant, service, operations)
	return out[:min(len(out), s.cfg.Operations)]
}
