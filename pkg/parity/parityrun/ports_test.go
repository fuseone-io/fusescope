package parityrun

import (
	"context"
	"testing"

	"github.com/fuseone-io/fusescope/pkg/parity"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestTheRoundsRegistryHoldsTheFourMetricsOnly(t *testing.T) {
	m := NewMetrics()
	m.Pair("services", "compare", "", "")
	m.Latency("services", "engine", 0.2)
	m.Coverage("services", 0.5)
	m.Divergent(parity.Settled)
	families, err := m.Registry().Gather()
	require.NoError(t, err)
	var names []string
	for _, f := range families {
		names = append(names, f.GetName())
		if f.GetName() == "fusescope_parity_pairs_total" {
			assert.InDelta(t, 1, f.GetMetric()[0].GetCounter().GetValue(), 0)
		}
		for _, metric := range f.GetMetric() {
			for _, l := range metric.GetLabel() {
				assert.Contains(t, []string{"view", "outcome", "category", "disposition", "provider", "window_class"}, l.GetName(), "a bounded label, never a tenant or a parameter")
			}
		}
	}
	assert.ElementsMatch(t, []string{
		"fusescope_parity_pairs_total",
		"fusescope_parity_request_duration_seconds",
		"fusescope_parity_coverage_ratio",
		"fusescope_parity_data_divergent_windows_total",
	}, names)
}

func TestTheMemoryKeyStoreKeepsOneKeyPerRun(t *testing.T) {
	s := NewMemoryKeyStore()
	require.NoError(t, s.Store(context.Background(), "run-1", []byte("k")))
	assert.Error(t, s.Store(context.Background(), "run-1", []byte("other")), "a run's key is written once")
}

func TestAMissingHealthSourceIsNeverHealthy(t *testing.T) {
	w := parity.Window{Start: 0, End: 3 * 60_000_000_000}
	unhealthy, err := unhealthyMinutes(context.Background(), nil, Tenants{}, orgA, w, 60_000_000_000)
	assert.Error(t, err)
	assert.Equal(t, map[int64]parity.FailureReason{0: parity.ReasonUnobserved, 60_000_000_000: parity.ReasonUnobserved, 120_000_000_000: parity.ReasonUnobserved}, unhealthy)
}
