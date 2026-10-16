package statsreporter

import (
	"context"
	"sync"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/factory"
	"github.com/fuseone-io/fusescope/pkg/types/ctxtypes"
	"github.com/fuseone-io/fusescope/pkg/types/instrumentationtypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
)

// Aggregator aggregates stats from every registered StatsCollector for a single organization.
type Aggregator interface {
	Aggregate(ctx context.Context, orgID valuer.UUID) (map[string]any, error)
}

type aggregator struct {
	// settings
	settings factory.ScopedProviderSettings

	// a list of collectors, used to collect stats from across the codebase
	collectors []StatsCollector
}

func NewAggregator(providerSettings factory.ProviderSettings, collectors []StatsCollector) Aggregator {
	settings := factory.NewScopedProviderSettings(providerSettings, "github.com/fuseone-io/fusescope/pkg/statsreporter")

	return &aggregator{
		settings:   settings,
		collectors: collectors,
	}
}

func (aggregator *aggregator) Aggregate(ctx context.Context, orgID valuer.UUID) (map[string]any, error) {
	ctx = ctxtypes.NewContextWithCommentVals(ctx, map[string]string{
		instrumentationtypes.CodeNamespace:    "statsreporter",
		instrumentationtypes.CodeFunctionName: "Aggregate",
	})
	var wg sync.WaitGroup
	wg.Add(len(aggregator.collectors))

	stats := make(map[string]any, 0)
	mtx := sync.Mutex{}

	for _, collector := range aggregator.collectors {
		go func(collector StatsCollector) {
			defer wg.Done()

			collectorStats, err := collector.Collect(ctx, orgID)
			if err != nil {
				aggregator.settings.Logger().ErrorContext(ctx, "failed to collect stats", errors.Attr(err))
				return
			}

			mtx.Lock()
			for k, v := range collectorStats {
				stats[k] = v
			}
			mtx.Unlock()
		}(collector)
	}
	wg.Wait()

	return stats, nil
}
