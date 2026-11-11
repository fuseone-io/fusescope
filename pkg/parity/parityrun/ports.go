package parityrun

import (
	"context"
	"slices"
	"strconv"
	"sync"
	"time"

	"github.com/prometheus/client_golang/prometheus"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/parity"
)

var (
	ErrCodeRunKey            = errors.MustNewCode("parity_run_key_store")
	ErrCodeHealthUnavailable = errors.MustNewCode("parity_health_unavailable")
)

// KeyStore keeps a round's run key where the on-call group can read it and the parity cannot.
type KeyStore interface {
	// Store writes the key of keyID once; writing it again is an error.
	Store(ctx context.Context, keyID string, key []byte) error
}

// MemoryKeyStore keeps run keys in the process only. A round's fingerprints cannot be matched once
// the process ends, so a parity using it is not deployable: the Secret store of D5 PR 4b is.
type MemoryKeyStore struct {
	mu   sync.Mutex
	keys map[string][]byte
}

func NewMemoryKeyStore() *MemoryKeyStore {
	return &MemoryKeyStore{keys: map[string][]byte{}}
}

func (s *MemoryKeyStore) Store(_ context.Context, keyID string, key []byte) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.keys[keyID]; ok {
		return errors.Newf(errors.TypeAlreadyExists, ErrCodeRunKey, "the run key %s is already stored", keyID)
	}
	s.keys[keyID] = append([]byte(nil), key...)
	return nil
}

// HealthSource reads the collector's exporter failures over a window.
type HealthSource interface {
	Failures(ctx context.Context, start, end time.Time) ([]parity.ExporterFailure, error)
}

// MetricsPusher sends a round's registry where it is collected.
type MetricsPusher interface {
	Push(ctx context.Context, registry *prometheus.Registry) error
}

// unhealthyMinutes are the minutes of w the dual write of org may have failed. Without a health
// source, or when it fails, every minute is unobserved and the error says the round does not
// qualify: an absent source is never a healthy one.
func unhealthyMinutes(ctx context.Context, source HealthSource, tenants Tenants, org string, w parity.Window, step int64) (map[int64]parity.FailureReason, error) {
	var failures []parity.ExporterFailure
	var err error = errors.Newf(errors.TypeUnsupported, ErrCodeHealthUnavailable, "no dual-write health source")
	if source != nil {
		failures, err = source.Failures(ctx, time.Unix(0, w.Start), time.Unix(0, w.End))
	}
	if err != nil {
		all := map[int64]parity.FailureReason{}
		for minute := w.Start; minute < w.End; minute += step {
			all[minute] = parity.ReasonUnobserved
		}
		return all, errors.Wrapf(err, errors.TypeUnsupported, ErrCodeHealthUnavailable, "the dual-write health is unknown")
	}
	out := map[int64]parity.FailureReason{}
	for minute, reason := range (parity.Health{Failures: failures, Serves: tenants.Serves}).Unhealthy(org) {
		if minute >= w.Start && minute < w.End {
			out[minute-((minute-w.Start)%step)] = reason
		}
	}
	return out, nil
}

// Metrics are a round's four metrics, in a registry of the round's own, labelled by bounded sets:
// never a tenant, a run or a parameter.
type Metrics struct {
	registry  *prometheus.Registry
	pairs     *prometheus.CounterVec
	duration  *prometheus.HistogramVec
	coverage  *prometheus.GaugeVec
	divergent *prometheus.CounterVec
}

func NewMetrics() *Metrics {
	m := &Metrics{
		registry: prometheus.NewRegistry(),
		pairs: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "fusescope_parity_pairs_total", Help: "Compared pairs by view, outcome, category and disposition.",
		}, []string{"view", "outcome", "category", "disposition"}),
		duration: prometheus.NewHistogramVec(prometheus.HistogramOpts{
			Name: "fusescope_parity_request_duration_seconds", Help: "Latency of each side of a pair.",
			Buckets: prometheus.ExponentialBuckets(0.005, 2, 14),
		}, []string{"view", "provider"}),
		coverage: prometheus.NewGaugeVec(prometheus.GaugeOpts{
			Name: "fusescope_parity_coverage_ratio", Help: "Reached over planned pairs of the round, by view.",
		}, []string{"view"}),
		divergent: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "fusescope_parity_data_divergent_windows_total", Help: "Minutes the count gate found divergent, by window class.",
		}, []string{"window_class"}),
	}
	m.registry.MustRegister(m.pairs, m.duration, m.coverage, m.divergent)
	return m
}

func (m *Metrics) Pair(view, outcome, category, disposition string) {
	m.pairs.WithLabelValues(view, outcome, category, disposition).Inc()
}

func (m *Metrics) Latency(view, provider string, seconds float64) {
	m.duration.WithLabelValues(view, provider).Observe(seconds)
}

func (m *Metrics) Coverage(view string, ratio float64) { m.coverage.WithLabelValues(view).Set(ratio) }

func (m *Metrics) Divergent(class parity.WindowClass) {
	m.divergent.WithLabelValues(string(class)).Inc()
}

func (m *Metrics) Registry() *prometheus.Registry { return m.registry }

// RequeueStore keeps the specs of pairs to run again in a later round, such as a partial engine
// answer. Specs name tenant data, so the store must be as protected as the run key. A round loads
// the queue and replaces it whole once it is done, only if no one changed it since: a round that
// fails or is cancelled leaves it as it was, so every spec is delivered at least once.
type RequeueStore interface {
	// Load returns the queued specs and the version they were read at.
	Load(ctx context.Context) ([]PairSpec, string, error)
	// Replace makes specs the queue if it is still at version.
	Replace(ctx context.Context, version string, specs []PairSpec) error
}

var ErrCodeRequeueConflict = errors.MustNewCode("parity_requeue_conflict")

// MemoryRequeue queues specs in the process only, so a queue does not outlive it: like the memory
// key store, it is not deployable.
type MemoryRequeue struct {
	mu      sync.Mutex
	specs   []PairSpec
	version int
}

func NewMemoryRequeue() *MemoryRequeue { return &MemoryRequeue{} }

func (q *MemoryRequeue) Load(context.Context) ([]PairSpec, string, error) {
	q.mu.Lock()
	defer q.mu.Unlock()
	return slices.Clone(q.specs), strconv.Itoa(q.version), nil
}

func (q *MemoryRequeue) Replace(_ context.Context, version string, specs []PairSpec) error {
	q.mu.Lock()
	defer q.mu.Unlock()
	if version != strconv.Itoa(q.version) {
		return errors.Newf(errors.TypeAlreadyExists, ErrCodeRequeueConflict, "the queue changed since it was loaded")
	}
	q.specs, q.version = slices.Clone(specs), q.version+1
	return nil
}
