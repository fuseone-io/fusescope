package logparsingpipeline

import (
	"context"
	stderrors "errors"
	"time"

	"github.com/fuseone-io/fusescope-collector-server/components/pkg/logspipeline"
	"github.com/fuseone-io/fusescope/pkg/errors"
	"go.opentelemetry.io/collector/component"
	"go.opentelemetry.io/collector/pdata/plog"
	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
	"go.uber.org/zap/zaptest/observer"
)

var (
	codeLogsPipelineInvalid = errors.MustNewCode("logs_pipeline_invalid_config")
	codeLogsPipelineBuild   = errors.MustNewCode("logs_pipeline_build_failed")
)

// previewProcessor is one logs pipeline processor as the collector gets it.
type previewProcessor struct {
	Name      string
	Operators []map[string]any
}

// simulateWithLogspipeline runs the logs through the processors in order on
// the collector's own log pipelines library (collector ADR 0012), and returns
// the logs that come out and the errors operators logged for records.
func simulateWithLogspipeline(ctx context.Context, processors []previewProcessor, logs []plog.Logs) ([]plog.Logs, []string, error) {
	core, recorded := observer.New(zapcore.WarnLevel)
	set := component.TelemetrySettings{Logger: zap.New(core)}

	built := make([]*logspipeline.Pipeline, 0, len(processors))
	for _, p := range processors {
		b, err := logspipeline.New(p.Operators, set)
		if err != nil {
			return nil, nil, previewBuildError(p.Name, err)
		}
		built = append(built, b)
	}
	// What the library logs while building, such as a grok pattern that does
	// not compile, is not about a record; the preview reports only records.
	recorded.TakeAll()

	ld := plog.NewLogs()
	for _, in := range logs {
		in.ResourceLogs().MoveAndAppendTo(ld.ResourceLogs())
	}
	now := time.Now()
	for _, p := range built {
		if err := ctx.Err(); err != nil {
			return nil, nil, errors.WrapCanceledf(err, codeLogsPipelineBuild, "logs pipeline simulation stopped")
		}
		out, ok := p.Process(ctx, ld, now)
		if !ok {
			ld = plog.NewLogs()
			break
		}
		ld = out
	}

	messages := []string{}
	for _, entry := range recorded.All() {
		fields := entry.ContextMap()
		id, _ := fields["operator_id"].(string)
		msg, _ := fields["error"].(string)
		if msg == "" {
			msg = entry.Message
		}
		messages = append(messages, "operator "+id+": "+normalizeExprMessage(msg))
	}
	return []plog.Logs{ld}, messages, nil
}

// previewBuildError classifies a configuration the library refuses as the
// preview always has: the operator list and an operator's fields are invalid
// input; an expression, an operator's own build or its outputs are a build
// failure.
func previewBuildError(processor string, err error) error {
	var ce *logspipeline.ConfigError
	if stderrors.As(err, &ce) {
		switch ce.Stage {
		case logspipeline.StageOperators, logspipeline.StageDecode:
			return errors.WrapInvalidInputf(err, codeLogsPipelineInvalid, "processor %s", processor)
		}
	}
	return errors.WrapInternalf(err, codeLogsPipelineBuild, "processor %s", processor)
}
