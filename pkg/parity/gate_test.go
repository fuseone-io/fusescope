package parity

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const minute = int64(time.Minute)

// base is an aligned instant; the windows of these tests start there.
const base = int64(29_000_000) * minute

func at(m int) int64 { return base + int64(m)*minute }

func span(from, to int) Window { return Window{Start: at(from), End: at(to)} }

// steady is n minutes of the same counts from minute 0.
func steady(n int, c Counts) map[int64]Counts {
	out := make(map[int64]Counts, n)
	for i := 0; i < n; i++ {
		out[at(i)] = c
	}
	return out
}

func with(m map[int64]Counts, i int, c Counts) map[int64]Counts {
	out := make(map[int64]Counts, len(m))
	for k, v := range m {
		out[k] = v
	}
	out[at(i)] = c
	return out
}

func settled(engine, clickhouse ServiceCounts) GateInput {
	return GateInput{Class: Settled, Window: span(0, 60), Engine: engine, ClickHouse: clickhouse}
}

func gate(t *testing.T, in GateInput) GateResult {
	t.Helper()
	got, err := Gate(DefaultWindowConfig(), in)
	require.NoError(t, err)
	return got
}

var ten = Counts{Raw: 10, Distinct: 10}

func TestACleanWindowIsComparedWhole(t *testing.T) {
	c := ServiceCounts{"a": steady(60, ten)}
	got := gate(t, settled(c, c))
	assert.Equal(t, map[string]Window{"a": span(0, 60)}, got.Services)
	assert.Equal(t, &Window{Start: at(0), End: at(60)}, got.Tenant)
	assert.Empty(t, got.Findings)
}

func TestADivergentMinuteLeavesTheLargestCleanSubinterval(t *testing.T) {
	ch := ServiceCounts{"a": steady(60, ten)}
	engine := ServiceCounts{"a": with(steady(60, ten), 40, Counts{Raw: 9, Distinct: 9})}
	got := gate(t, settled(engine, ch))
	assert.Equal(t, map[string]Window{"a": span(0, 40)}, got.Services)
	assert.Equal(t, []GateFinding{{Service: "a", Minute: at(40), Verdict: Verdict{Category: CategoryDivergentData, Disposition: Blocking}}}, got.Findings)
}

func TestTheGateNeverRemovesLooseMinutes(t *testing.T) {
	ch := ServiceCounts{"a": steady(60, ten)}
	odd := Counts{Raw: 11, Distinct: 11}

	one := ServiceCounts{"a": with(with(steady(60, ten), 10, odd), 50, odd)}
	assert.Equal(t, map[string]Window{"a": span(11, 50)}, gate(t, settled(one, ch)).Services, "the middle run, not the window without two minutes")

	two := ServiceCounts{"a": with(with(steady(60, ten), 20, odd), 45, odd)}
	got := gate(t, settled(two, ch))
	assert.Empty(t, got.Services, "runs of 20, 24 and 14 minutes are all under 30: the pair leaves whole")
	assert.Nil(t, got.Tenant)
	assert.Len(t, got.Findings, 2)
}

func TestAnIngestionDuplicateIsADivergence(t *testing.T) {
	ch := ServiceCounts{"a": steady(60, ten)}
	engine := ServiceCounts{"a": with(steady(60, ten), 5, Counts{Raw: 12, Distinct: 10})}
	got := gate(t, settled(engine, ch))
	assert.Equal(t, map[string]Window{"a": span(6, 60)}, got.Services)
	assert.Equal(t, []GateFinding{{Service: "a", Minute: at(5), Verdict: Verdict{Category: CategoryIngestionDuplicate, Disposition: Blocking}}}, got.Findings, "explained, still blocking")
}

func TestARecentDivergenceIsInconclusive(t *testing.T) {
	ch := ServiceCounts{"a": steady(5, ten)}
	engine := ServiceCounts{"a": with(steady(5, ten), 2, Counts{Raw: 7, Distinct: 7})}
	got := gate(t, GateInput{Class: Recent, Window: span(0, 5), Engine: engine, ClickHouse: ch})
	assert.Empty(t, got.Services, "a recent window needs all of its 5 minutes")
	assert.Equal(t, []GateFinding{{Service: "a", Minute: at(2), Verdict: Verdict{Category: CategoryDivergentData, Disposition: Inconclusive}}}, got.Findings)

	dup := ServiceCounts{"a": with(steady(5, ten), 2, Counts{Raw: 11, Distinct: 10})}
	got = gate(t, GateInput{Class: Recent, Window: span(0, 5), Engine: dup, ClickHouse: ch})
	require.NotEmpty(t, got.Findings)
	assert.Equal(t, Verdict{Category: CategoryIngestionDuplicate, Disposition: Inconclusive}, got.Findings[0].Verdict)
}

func TestAMinuteOnOneSideOnlyDiverges(t *testing.T) {
	ch := ServiceCounts{"a": steady(60, ten)}
	engine := ServiceCounts{"a": steady(60, ten)}
	delete(engine["a"], at(30))
	got := gate(t, settled(engine, ch))
	assert.Equal(t, map[string]Window{"a": span(0, 30)}, got.Services, "30 minutes before it, 29 after")
	require.Len(t, got.Findings, 1)
	assert.Equal(t, at(30), got.Findings[0].Minute)

	quiet := ServiceCounts{"a": steady(60, ten)}
	delete(quiet["a"], at(30))
	assert.Equal(t, map[string]Window{"a": span(0, 60)}, gate(t, settled(quiet, quiet)).Services, "a minute with no spans in either store is clean")
}

func TestTiesBetweenRunsGoToTheEarliest(t *testing.T) {
	c := ServiceCounts{"a": steady(61, ten)}
	engine := ServiceCounts{"a": with(steady(61, ten), 30, Counts{Raw: 1, Distinct: 1})}
	got := gate(t, GateInput{Class: Settled, Window: span(0, 61), Engine: engine, ClickHouse: c})
	assert.Equal(t, map[string]Window{"a": span(0, 30)}, got.Services)
}

func TestTheTenantWindowIsCleanForEveryService(t *testing.T) {
	ch := ServiceCounts{"a": steady(60, ten), "b": steady(60, ten)}
	odd := Counts{Raw: 3, Distinct: 3}
	engine := ServiceCounts{"a": with(steady(60, ten), 50, odd), "b": with(steady(60, ten), 5, odd)}
	got := gate(t, settled(engine, ch))
	assert.Equal(t, map[string]Window{"a": span(0, 50), "b": span(6, 60)}, got.Services)
	assert.Equal(t, &Window{Start: at(6), End: at(50)}, got.Tenant, "a tenant-wide view reads every service")

	missing := ServiceCounts{"a": steady(60, ten)}
	got = gate(t, settled(missing, ch))
	assert.NotContains(t, got.Services, "b", "a service the engine lacks entirely diverges every minute")
	assert.Nil(t, got.Tenant)
	assert.Len(t, got.Findings, 60)
}

func TestAnUnhealthyMinuteIsLeftOutButIsNoDivergence(t *testing.T) {
	c := ServiceCounts{"a": steady(60, ten)}
	in := settled(c, c)
	in.Unhealthy = map[int64]FailureReason{at(45): ReasonSendFailed}
	got := gate(t, in)
	assert.Equal(t, map[string]Window{"a": span(0, 45)}, got.Services)
	assert.Equal(t, &Window{Start: at(0), End: at(45)}, got.Tenant)
	assert.Equal(t, []GateFinding{{Minute: at(45), Reason: ReasonSendFailed, Verdict: Verdict{Category: CategoryDualWriteUnhealthy, Disposition: Inconclusive}}}, got.Findings)
}

func TestTheGateRefusesInputItCannotTrust(t *testing.T) {
	c := ServiceCounts{"a": steady(60, ten)}
	cases := map[string]GateInput{
		"misaligned":       {Class: Settled, Window: Window{Start: at(0) + 1, End: at(60)}, Engine: c, ClickHouse: c},
		"empty":            {Class: Settled, Window: span(10, 10), Engine: c, ClickHouse: c},
		"unknown class":    {Class: "warm", Window: span(0, 60), Engine: c, ClickHouse: c},
		"distinct > raw":   settled(ServiceCounts{"a": with(steady(60, ten), 3, Counts{Raw: 1, Distinct: 2})}, c),
		"negative":         settled(ServiceCounts{"a": with(steady(60, ten), 3, Counts{Raw: -1, Distinct: -1})}, c),
		"outside window":   settled(ServiceCounts{"a": with(steady(60, ten), 60, ten)}, c),
		"misaligned count": settled(ServiceCounts{"a": map[int64]Counts{at(3) + 7: ten}}, c),
		"unhealthy outside": func() GateInput {
			in := settled(c, c)
			in.Unhealthy = map[int64]FailureReason{at(-1): ReasonDropped}
			return in
		}(),
	}
	for name, in := range cases {
		_, err := Gate(DefaultWindowConfig(), in)
		assert.Error(t, err, name)
	}
}
