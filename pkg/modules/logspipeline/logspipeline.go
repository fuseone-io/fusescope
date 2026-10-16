package logspipeline

import "github.com/fuseone-io/fusescope/pkg/statsreporter"

type Module interface {
	statsreporter.StatsCollector
}
