package parity

import (
	"slices"

	"github.com/fuseone-io/fusescope/pkg/errors"
)

var ErrCodeGate = errors.MustNewCode("parity_gate")

// Counts is how many spans a store holds for one service in one minute, and how many distinct
// span ids among them.
type Counts struct {
	Raw      int64
	Distinct int64
}

// ServiceCounts is a store's counts by service and by minute start; a minute that is not there
// holds no spans.
type ServiceCounts map[string]map[int64]Counts

// GateInput is what the count gate weighs for one tenant and one window: both stores' counts and
// the minutes the dual write was unhealthy.
type GateInput struct {
	Class      WindowClass
	Window     Window
	Engine     ServiceCounts
	ClickHouse ServiceCounts
	Unhealthy  map[int64]FailureReason
}

// GateFinding is a minute the gate left out: a service whose counts differ, or, with no service,
// a minute the dual write was unhealthy for the whole tenant.
type GateFinding struct {
	Service string
	Minute  int64
	Reason  FailureReason
	Verdict Verdict
}

// GateResult is the window each service is compared on and the one tenant-wide views are, each
// the largest contiguous clean subinterval; a service or tenant without one leaves the comparison.
type GateResult struct {
	Services map[string]Window
	Tenant   *Window
	Findings []GateFinding
}

// Gate keeps, for every service and for the tenant, the largest contiguous run of minutes in which
// both stores hold the same spans, the earliest of equal runs, if it is no shorter than the class's
// minimum. It never drops loose minutes: the views only take contiguous windows. A minute counted
// differently is divergent data, or an ingestion duplicate when only the raw counts differ; either
// blocks on a settled window and is inconclusive on a recent one. An unhealthy minute leaves every
// service out without being a divergence.
//
// # Errors
//
// An invalid configuration or window, or counts or minutes the window cannot hold.
func Gate(cfg WindowConfig, in GateInput) (GateResult, error) {
	minimum, step, err := gateBounds(cfg, in)
	if err != nil {
		return GateResult{}, err
	}
	n := int((in.Window.End - in.Window.Start) / step)
	minuteAt := func(i int) int64 { return in.Window.Start + int64(i)*step }
	divergence := Verdict{Category: CategoryDivergentData, Disposition: Blocking}
	duplicate := Verdict{Category: CategoryIngestionDuplicate, Disposition: Blocking}
	if in.Class == Recent {
		divergence.Disposition, duplicate.Disposition = Inconclusive, Inconclusive
	}

	result := GateResult{Services: map[string]Window{}}
	healthy := make([]bool, n)
	for i := range healthy {
		reason, unhealthy := in.Unhealthy[minuteAt(i)]
		healthy[i] = !unhealthy
		if unhealthy {
			result.Findings = append(result.Findings, GateFinding{Minute: minuteAt(i), Reason: reason, Verdict: Verdict{Category: CategoryDualWriteUnhealthy, Disposition: Inconclusive}})
		}
	}
	tenant := slices.Clone(healthy)
	for _, service := range serviceNames(in.Engine, in.ClickHouse) {
		clean := slices.Clone(healthy)
		for i := range clean {
			if !clean[i] {
				continue
			}
			e, c := in.Engine[service][minuteAt(i)], in.ClickHouse[service][minuteAt(i)]
			if e == c {
				continue
			}
			clean[i], tenant[i] = false, false
			verdict := divergence
			if e.Distinct == c.Distinct {
				verdict = duplicate
			}
			result.Findings = append(result.Findings, GateFinding{Service: service, Minute: minuteAt(i), Verdict: verdict})
		}
		if w, ok := longestRun(clean, minuteAt, step, minimum); ok {
			result.Services[service] = w
		}
	}
	if w, ok := longestRun(tenant, minuteAt, step, minimum); ok {
		result.Tenant = &w
	}
	return result, nil
}

func gateBounds(cfg WindowConfig, in GateInput) (minimum, step int64, err error) {
	if err := cfg.validate(); err != nil {
		return 0, 0, err
	}
	m, err := cfg.minimum(in.Class)
	if err != nil {
		return 0, 0, err
	}
	step = int64(cfg.Step)
	w := in.Window
	if w.Start >= w.End || w.Start%step != 0 || w.End%step != 0 {
		return 0, 0, errors.Newf(errors.TypeInvalidInput, ErrCodeGate, "the window must be non-empty and aligned to the step")
	}
	inWindow := func(minute int64) bool { return minute >= w.Start && minute < w.End && minute%step == 0 }
	for _, store := range []ServiceCounts{in.Engine, in.ClickHouse} {
		for _, minutes := range store {
			for minute, c := range minutes {
				if !inWindow(minute) || c.Distinct < 0 || c.Distinct > c.Raw {
					return 0, 0, errors.Newf(errors.TypeInvalidInput, ErrCodeGate, "counts %+v at %d do not fit the window", c, minute)
				}
			}
		}
	}
	for minute := range in.Unhealthy {
		if !inWindow(minute) {
			return 0, 0, errors.Newf(errors.TypeInvalidInput, ErrCodeGate, "unhealthy minute %d is outside the window", minute)
		}
	}
	return int64(m), step, nil
}

func serviceNames(stores ...ServiceCounts) []string {
	seen := map[string]bool{}
	var out []string
	for _, store := range stores {
		for service := range store {
			if !seen[service] {
				seen[service] = true
				out = append(out, service)
			}
		}
	}
	slices.Sort(out)
	return out
}

// longestRun is the earliest of the longest runs of clean minutes, if it lasts at least minimum.
func longestRun(clean []bool, minuteAt func(int) int64, step, minimum int64) (Window, bool) {
	bestStart, bestLen, runStart := 0, 0, 0
	for i := 0; i <= len(clean); i++ {
		if i < len(clean) && clean[i] {
			continue
		}
		if i-runStart > bestLen {
			bestStart, bestLen = runStart, i-runStart
		}
		runStart = i + 1
	}
	if bestLen == 0 || int64(bestLen)*step < minimum {
		return Window{}, false
	}
	return Window{Start: minuteAt(bestStart), End: minuteAt(bestStart + bestLen)}, true
}
