package parity

import (
	"fmt"
	"math/rand/v2"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func sampler(t *testing.T, seed Seed) Sampler {
	t.Helper()
	s, err := NewSampler(seed, span(0, 60), DefaultSampleConfig())
	require.NoError(t, err)
	return s
}

func names(prefix string, n int) []string {
	out := make([]string, n)
	for i := range out {
		out[i] = fmt.Sprintf("%s-%03d", prefix, i)
	}
	return out
}

func shuffled[T any](in []T) []T {
	out := append([]T(nil), in...)
	r := rand.New(rand.NewPCG(1, 2))
	r.Shuffle(len(out), func(i, j int) { out[i], out[j] = out[j], out[i] })
	return out
}

func TestServicesAreSampledByTheSeedWhateverTheInputOrder(t *testing.T) {
	all := names("svc", 100)
	s := sampler(t, 7)
	got := s.Services("t1", all)
	assert.Len(t, got, 20)
	assert.Equal(t, got, s.Services("t1", shuffled(all)))
	assert.Equal(t, got, sampler(t, 7).Services("t1", append(shuffled(all), all[:10]...)), "a repeated name counts once")
	assert.NotEqual(t, got, sampler(t, 8).Services("t1", all), "another seed, another sample")
	assert.NotEqual(t, got, s.Services("t2", all), "tenants are sampled apart")

	few := names("svc", 3)
	assert.ElementsMatch(t, few, s.Services("t1", few), "fewer than N: all of them")
}

func TestTheSampleMovesWithTheWindow(t *testing.T) {
	all := names("svc", 100)
	later, err := NewSampler(7, span(60, 120), DefaultSampleConfig())
	require.NoError(t, err)
	assert.NotEqual(t, sampler(t, 7).Services("t1", all), later.Services("t1", all), "rounds rotate through the services")
}

func TestOperationsAreSampledPerService(t *testing.T) {
	ops := names("op", 50)
	s := sampler(t, 7)
	got := s.Operations("t1", "svc-a", ops)
	assert.Len(t, got, 5)
	assert.Equal(t, got, s.Operations("t1", "svc-a", shuffled(ops)))
	assert.NotEqual(t, got, s.Operations("t1", "svc-b", ops))
}

func candidates() []TraceCandidate {
	var out []TraceCandidate
	add := func(prefix string, n int, spans int64, withError bool) {
		for i := 0; i < n; i++ {
			out = append(out, TraceCandidate{ID: fmt.Sprintf("%s-%02d", prefix, i), Spans: spans + int64(i), HasError: withError})
		}
	}
	add("huge", 5, 10_001, false)                                // above max_rows
	add("big", 5, 9_990, false)                                  // the largest within it, up to 9 994
	add("wide", 10, 2_000, false)                                // windowed in the waterfall
	add("error", 10, 3, true)                                    // small, with an error
	add("plain", 100, 1, false)                                  // anything
	out = append(out, TraceCandidate{ID: "edge", Spans: 10_000}) // exactly max_rows: still within
	return out
}

var limits = TraceLimits{MaxRows: 10_000, WindowedAbove: 1_000}

func reasons(got []SampledTrace) map[TraceReason]int {
	out := map[TraceReason]int{}
	for _, tr := range got {
		out[tr.Reason]++
	}
	return out
}

func TestTracesCoverEveryKind(t *testing.T) {
	got := sampler(t, 7).Traces("t1", candidates(), limits)
	q := DefaultSampleConfig().Traces
	assert.Len(t, got, q.Total)
	assert.Equal(t, map[TraceReason]int{
		ReasonAboveMaxRows: q.AboveMaxRows,
		ReasonLargest:      q.Largest,
		ReasonWithError:    q.WithError,
		ReasonWindowed:     q.Windowed,
		ReasonRandom:       q.Total - q.AboveMaxRows - q.Largest - q.WithError - q.Windowed,
	}, reasons(got))

	byID := map[string]TraceCandidate{}
	for _, c := range candidates() {
		byID[c.ID] = c
	}
	seen := map[string]bool{}
	for _, tr := range got {
		assert.False(t, seen[tr.ID], "%s twice", tr.ID)
		seen[tr.ID] = true
		c := byID[tr.ID]
		switch tr.Reason {
		case ReasonAboveMaxRows:
			assert.Greater(t, c.Spans, limits.MaxRows, tr.ID)
		case ReasonWindowed:
			assert.True(t, c.Spans > limits.WindowedAbove && c.Spans <= limits.MaxRows, tr.ID)
		case ReasonWithError:
			assert.True(t, c.HasError, tr.ID)
		}
	}
	assert.True(t, seen["edge"] && seen["big-04"] && seen["big-03"], "the largest within max_rows, max_rows itself included")
}

func TestTracesAreSampledByTheSeedWhateverTheInputOrder(t *testing.T) {
	s := sampler(t, 7)
	got := s.Traces("t1", candidates(), limits)
	assert.Equal(t, got, s.Traces("t1", shuffled(candidates()), limits))
	assert.NotEqual(t, got, sampler(t, 9).Traces("t1", candidates(), limits))
}

func TestFewCandidatesAreAllSampled(t *testing.T) {
	few := []TraceCandidate{{ID: "a", Spans: 3}, {ID: "b", Spans: 20_000}}
	got := sampler(t, 7).Traces("t1", few, limits)
	assert.ElementsMatch(t, []SampledTrace{{ID: "b", Reason: ReasonAboveMaxRows}, {ID: "a", Reason: ReasonLargest}}, got)
}

func TestARepeatedTraceIsOneAtItsLargestWithAnyError(t *testing.T) {
	cfg := DefaultSampleConfig()
	cfg.Traces.Largest = 0
	s, err := NewSampler(7, span(0, 60), cfg)
	require.NoError(t, err)
	repeated := []TraceCandidate{{ID: "a", Spans: 20_000}, {ID: "c", Spans: 2, HasError: true}, {ID: "b", Spans: 3}, {ID: "a", Spans: 3}, {ID: "c", Spans: 2}}
	assert.Equal(t, []SampledTrace{{ID: "a", Reason: ReasonAboveMaxRows}, {ID: "c", Reason: ReasonWithError}, {ID: "b", Reason: ReasonRandom}}, s.Traces("t1", repeated, limits))
}

func TestASamplerRefusesAConfigurationItCannotHonour(t *testing.T) {
	bad := map[string]func(*SampleConfig){
		"no services":       func(c *SampleConfig) { c.Services = 0 },
		"no operations":     func(c *SampleConfig) { c.Operations = 0 },
		"quotas over total": func(c *SampleConfig) { c.Traces.WithError = c.Traces.Total },
		"negative quota":    func(c *SampleConfig) { c.Traces.Windowed = -1 },
	}
	for name, mutate := range bad {
		cfg := DefaultSampleConfig()
		mutate(&cfg)
		_, err := NewSampler(1, span(0, 60), cfg)
		assert.Error(t, err, name)
	}
	_, err := NewSampler(1, span(5, 5), DefaultSampleConfig())
	assert.Error(t, err, "an empty window")
}
