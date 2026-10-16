package statsreporter

import (
	"context"

	"github.com/fuseone-io/fusescope/pkg/factory"
	"github.com/fuseone-io/fusescope/pkg/valuer"
)

type StatsReporter interface {
	factory.Service

	Report(context.Context) error
}

type StatsCollector interface {
	Collect(context.Context, valuer.UUID) (map[string]any, error)
}
