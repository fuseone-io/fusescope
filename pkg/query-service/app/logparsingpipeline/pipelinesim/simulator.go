// Package pipelinesim runs log pipeline processors in-process, the way the
// collector's logs pipeline processor runs them, so pipeline previews match
// what the collector produces. Each call builds its own operators: runs share
// no state and may happen concurrently.
package pipelinesim

import (
	"context"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/open-telemetry/opentelemetry-collector-contrib/pkg/stanza/entry"
	"go.opentelemetry.io/collector/pdata/plog"
)

var (
	CodeInvalidConfig  = errors.MustNewCode("logs_pipeline_invalid_config")
	CodeBuildFailed    = errors.MustNewCode("logs_pipeline_build_failed")
	CodeSimulationStop = errors.MustNewCode("logs_pipeline_simulation_stopped")
)

// Processor is one logs pipeline processor as deployed to the collector:
// its operators in the form the collector config holds them.
type Processor struct {
	Name      string
	Operators []map[string]any
}

// Simulate runs the logs through the processors in order and returns the
// logs that come out and the errors operators reported for entries.
//
// Configs the collector would not load are invalid-input errors; operators
// that fail to build are internal errors.
func Simulate(ctx context.Context, processors []Processor, logs []plog.Logs) ([]plog.Logs, []string, error) {
	built := make([]*pipeline, 0, len(processors))
	for _, p := range processors {
		b, err := buildPipeline(p)
		if err != nil {
			return nil, nil, err
		}
		built = append(built, b)
	}

	entries := []*entry.Entry{}
	for _, pl := range logs {
		entries = append(entries, entriesFromPLogs(pl)...)
	}

	report := &report{}
	for _, p := range built {
		var err error
		entries, err = p.run(ctx, entries, report)
		if err != nil {
			return nil, nil, err
		}
		// Each processor gets the logs in pdata form from the one before it.
		entries = entriesFromPLogs(plogsFromEntries(entries))
	}

	return []plog.Logs{plogsFromEntries(entries)}, report.messages, nil
}

type report struct {
	messages []string
}

func (r *report) add(operatorID string, err error) {
	r.messages = append(r.messages, "operator "+operatorID+": "+err.Error())
}
