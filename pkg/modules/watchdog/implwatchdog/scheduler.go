package implwatchdog

import (
	"context"
	"log/slog"
	"slices"
	"strings"
	"sync"
	"time"

	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/metric"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/factory"
	"github.com/fuseone-io/fusescope/pkg/modules/organization"
	"github.com/fuseone-io/fusescope/pkg/types"
	"github.com/fuseone-io/fusescope/pkg/types/watchdogtypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
)

const (
	cycleDeadline   = 4 * time.Minute
	orgBudget       = time.Minute
	maxParallelOrgs = 2

	orgEvaluated       = "evaluated"
	orgSkippedDeadline = "skipped_deadline"
	orgError           = "error"
)

type evaluateFunc func(ctx context.Context, orgID valuer.UUID, window watchdogtypes.Window) error

// scheduler runs the cycles of one lease session. Its round-robin cursor
// lives as long as the session: a failover starts again from the first
// organization.
type scheduler struct {
	logger        *slog.Logger
	orgGetter     organization.Getter
	evaluate      evaluateFunc
	deadline      time.Duration
	orgs          metric.Int64Counter
	cycleDuration metric.Float64Histogram
	lastStarted   *valuer.UUID
}

func newScheduler(providerSettings factory.ProviderSettings, orgGetter organization.Getter, evaluate evaluateFunc) (*scheduler, error) {
	settings := factory.NewScopedProviderSettings(providerSettings, "github.com/fuseone-io/fusescope/pkg/modules/watchdog/implwatchdog")
	orgs, err := settings.Meter().Int64Counter("fusescope.watchdog.orgs", metric.WithDescription("Organizations per Watchdog cycle, by result."))
	if err != nil {
		return nil, err
	}
	cycleDuration, err := settings.Meter().Float64Histogram("fusescope.watchdog.cycle_duration", metric.WithUnit("s"), metric.WithDescription("Duration of Watchdog cycles."))
	if err != nil {
		return nil, err
	}
	return &scheduler{logger: settings.Logger(), orgGetter: orgGetter, evaluate: evaluate, deadline: cycleDeadline, orgs: orgs, cycleDuration: cycleDuration}, nil
}

// runCycle evaluates the window lagging now, at most maxParallelOrgs
// organizations at once, until the cycle deadline. It starts at the
// organization after the one the previous cycle started last, and reports
// how many organizations ended with each result.
func (s *scheduler) runCycle(ctx context.Context, now time.Time) map[string]int {
	started := time.Now()
	cycleCtx, cancel := context.WithTimeout(ctx, s.deadline)
	defer cancel()

	orgs, err := s.orgGetter.ListByOwnedKeyRange(cycleCtx)
	if err != nil {
		s.logger.ErrorContext(ctx, "couldn't list the organizations for watchdog", errors.Attr(err))
		return map[string]int{}
	}
	window := watchdogtypes.NewWindow(now)
	report := map[string]int{}
	var mu sync.Mutex
	record := func(result string) {
		mu.Lock()
		defer mu.Unlock()
		report[result]++
		s.orgs.Add(ctx, 1, metric.WithAttributes(attribute.String("result", result)))
	}

	slots := make(chan struct{}, maxParallelOrgs)
	var wg sync.WaitGroup
	for _, org := range s.rotate(orgs) {
		select {
		case slots <- struct{}{}:
		case <-cycleCtx.Done():
		}
		if cycleCtx.Err() != nil {
			record(orgSkippedDeadline)
			continue
		}
		s.lastStarted = &org.ID
		wg.Go(func() {
			defer func() { <-slots }()
			record(s.evaluateOrg(cycleCtx, org.ID, window))
		})
	}
	wg.Wait()
	s.cycleDuration.Record(ctx, time.Since(started).Seconds())
	return report
}

func (s *scheduler) evaluateOrg(cycleCtx context.Context, orgID valuer.UUID, window watchdogtypes.Window) string {
	orgCtx, cancel := context.WithTimeout(cycleCtx, orgBudget)
	defer cancel()
	err := s.evaluate(orgCtx, orgID, window)
	switch {
	case err == nil:
		return orgEvaluated
	case cycleCtx.Err() != nil:
		return orgSkippedDeadline
	}
	s.logger.WarnContext(cycleCtx, "watchdog evaluation of an organization failed", slog.String("org_id", orgID.StringValue()), errors.Attr(err))
	return orgError
}

// rotate orders the organizations by ID, starting after the last one
// started.
func (s *scheduler) rotate(orgs []*types.Organization) []*types.Organization {
	sorted := slices.SortedFunc(slices.Values(orgs), func(a, b *types.Organization) int {
		return strings.Compare(a.ID.StringValue(), b.ID.StringValue())
	})
	if s.lastStarted == nil {
		return sorted
	}
	next, _ := slices.BinarySearchFunc(sorted, *s.lastStarted, func(org *types.Organization, id valuer.UUID) int {
		if strings.Compare(org.ID.StringValue(), id.StringValue()) <= 0 {
			return -1
		}
		return 1
	})
	return append(sorted[next:], sorted[:next]...)
}
