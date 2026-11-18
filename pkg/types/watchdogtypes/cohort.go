package watchdogtypes

import (
	"cmp"
	"maps"
	"slices"
)

// MinBaselineBuckets of the Seasons × WindowBuckets baseline buckets must
// have spans for a service to join the cohort: the scorer needs ten
// residuals.
const MinBaselineBuckets = 10

// Cohort is the services one organization evaluates in one cycle, in batches
// of at most max_series services. Active services are always in it.
type Cohort struct {
	Batches []Batch
	// ActiveOverflow is how many active services exceed max_series and
	// pushed the cohort into extra batches.
	ActiveOverflow int
}

type Batch struct {
	Services []string
	// Refetch are the batch's active services that a discovery season,
	// cut at max_series, may have left out; their baselines are queried
	// for this batch alone.
	Refetch []string
}

// NewCohort fills the cohort with the active services, then with the
// eligible discovered services by predicted volume up to maxSeries. seasons
// are the discovery responses, one per season.
func NewCohort(window Window, active []string, seasons []*REDResult, maxSeries int) Cohort {
	actives := slices.Compact(slices.Sorted(slices.Values(active)))
	isActive := make(map[string]bool, len(actives))
	for _, service := range actives {
		isActive[service] = true
	}

	candidates := make([]candidate, 0)
	for _, service := range discovered(seasons) {
		baselines := BaselinesOf(seasons, service)
		if isActive[service] || !hasEligibleBaseline(window, baselines) {
			continue
		}
		candidates = append(candidates, candidate{service: service, volume: PredictedVolume(window, baselines)})
	}
	slices.SortFunc(candidates, func(a, b candidate) int {
		return cmp.Or(cmp.Compare(b.volume, a.volume), cmp.Compare(a.service, b.service))
	})

	services := slices.Clone(actives)
	for _, candidate := range candidates[:min(len(candidates), max(0, maxSeries-len(actives)))] {
		services = append(services, candidate.service)
	}

	cohort := Cohort{ActiveOverflow: max(0, len(actives)-maxSeries)}
	for chunk := range slices.Chunk(services, maxSeries) {
		batch := Batch{Services: chunk}
		for _, service := range chunk {
			if isActive[service] && mayBeCut(seasons, service, maxSeries) {
				batch.Refetch = append(batch.Refetch, service)
			}
		}
		cohort.Batches = append(cohort.Batches, batch)
	}
	return cohort
}

// PredictedVolume is the median, over the seasons a service appears in, of
// its window's request count.
func PredictedVolume(window Window, baselines []*REDSeries) float64 {
	totals := make([]float64, 0, len(baselines))
	for _, baseline := range baselines {
		if baseline != nil {
			total, _ := baseline.windowRequests(window)
			totals = append(totals, total)
		}
	}
	if len(totals) == 0 {
		return 0
	}
	slices.Sort(totals)
	n := len(totals)
	if n%2 == 1 {
		return totals[n/2]
	}
	return (totals[n/2-1] + totals[n/2]) / 2
}

// BaselinesOf returns the service's series in each season, nil where absent.
func BaselinesOf(seasons []*REDResult, service string) []*REDSeries {
	baselines := make([]*REDSeries, len(seasons))
	for k, season := range seasons {
		if season != nil {
			baselines[k] = season.Services[service]
		}
	}
	return baselines
}

type candidate struct {
	service string
	volume  float64
}

func discovered(seasons []*REDResult) []string {
	seen := map[string]bool{}
	for _, season := range seasons {
		if season == nil {
			continue
		}
		for service := range season.Services {
			seen[service] = true
		}
	}
	return slices.Sorted(maps.Keys(seen))
}

func hasEligibleBaseline(window Window, baselines []*REDSeries) bool {
	present := 0
	for _, baseline := range baselines {
		_, buckets := baseline.windowRequests(window)
		present += buckets
	}
	return present >= MinBaselineBuckets
}

// mayBeCut reports whether a season that returned max_series services, and
// so may have cut others, lacks the service.
func mayBeCut(seasons []*REDResult, service string, maxSeries int) bool {
	for _, season := range seasons {
		if season == nil {
			return true
		}
		if _, ok := season.Services[service]; !ok && len(season.Services) >= maxSeries {
			return true
		}
	}
	return false
}
