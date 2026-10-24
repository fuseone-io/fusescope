package logparsingpipeline

import (
	"context"
	"sort"
	"strings"
	"time"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/query-service/app/logparsingpipeline/pipelinesim"
	"github.com/fuseone-io/fusescope/pkg/query-service/model"
	"github.com/fuseone-io/fusescope/pkg/types/pipelinetypes"
	"go.opentelemetry.io/collector/pdata/pcommon"
	"go.opentelemetry.io/collector/pdata/plog"
	"gopkg.in/yaml.v3"
)

func SimulatePipelinesProcessing(ctx context.Context, pipelines []pipelinetypes.GettablePipeline, logs []model.SignozLog) (
	[]model.SignozLog, []string, error) {
	if len(pipelines) < 1 {
		return logs, nil, nil
	}

	outputPLogs, collectorErrs, err := simulatePipelinesOnPLogs(ctx, pipelines, previewInputPLogs(logs))
	if err != nil {
		return nil, nil, err
	}

	outputSignozLogs, collectorWarnAndErrorLogs := previewOutputLogs(outputPLogs, collectorErrs)
	return outputSignozLogs, collectorWarnAndErrorLogs, nil
}

func previewOutputLogs(outputPLogs []plog.Logs, collectorErrs []string) ([]model.SignozLog, []string) {
	outputSignozLogs := PLogsToSignozLogs(outputPLogs)

	// Sort output logs by their order in the input and remove the temp ordering attribute
	sort.Slice(outputSignozLogs, func(i, j int) bool {
		iIdx := outputSignozLogs[i].Attributes_int64[inputOrderAttribute]
		jIdx := outputSignozLogs[j].Attributes_int64[inputOrderAttribute]
		return iIdx < jIdx
	})
	for _, sigLog := range outputSignozLogs {
		delete(sigLog.Attributes_int64, inputOrderAttribute)
	}

	collectorWarnAndErrorLogs := []string{}
	for _, log := range collectorErrs {
		// if log is empty or log comes from featuregate.go, then remove it
		if log == "" || strings.Contains(log, "featuregate.go") {
			continue
		}
		collectorWarnAndErrorLogs = append(collectorWarnAndErrorLogs, log)
	}

	return outputSignozLogs, collectorWarnAndErrorLogs
}

// Collector simulation does not guarantee that logs will come
// out in the same order as in the input.
//
// Add a temp attribute for sorting logs in simulation output
const inputOrderAttribute = "__signoz_input_idx__"

func previewInputPLogs(logs []model.SignozLog) []plog.Logs {
	for i := 0; i < len(logs); i++ {
		if logs[i].Attributes_int64 == nil {
			logs[i].Attributes_int64 = map[string]int64{}
		}
		logs[i].Attributes_int64[inputOrderAttribute] = int64(i)
	}
	return SignozLogsToPLogs(logs)
}

func simulatePipelinesOnPLogs(ctx context.Context, pipelines []pipelinetypes.GettablePipeline, simulatorInputPLogs []plog.Logs) ([]plog.Logs, []string, error) {
	processors, err := simulatorProcessors(pipelines)
	if err != nil {
		return nil, nil, err
	}
	return pipelinesim.Simulate(ctx, processors, simulatorInputPLogs)
}

// simulatorProcessors returns the processors the collector would get for the
// pipelines, in the shape its config holds them.
func simulatorProcessors(pipelines []pipelinetypes.GettablePipeline) ([]pipelinesim.Processor, error) {
	configs, names, err := PreparePipelineProcessor(pipelines)
	if err != nil {
		return nil, errors.WrapInvalidInputf(err, errors.CodeInvalidInput, "invalid config")
	}

	processors := make([]pipelinesim.Processor, 0, len(names))
	for _, name := range names {
		serialized, err := yaml.Marshal(configs[name])
		if err != nil {
			return nil, errors.WrapInternalf(err, CodeCollectorConfigMarshalFailed, "could not marshal processor config for %s", name)
		}
		var config struct {
			Operators []map[string]any `yaml:"operators"`
		}
		if err := yaml.Unmarshal(serialized, &config); err != nil {
			return nil, errors.WrapInternalf(err, CodeCollectorConfigUnmarshalFailed, "could not unmarshal processor config for %s", name)
		}
		processors = append(processors, pipelinesim.Processor{Name: name, Operators: config.Operators})
	}
	return processors, nil
}

// plog doesn't contain an ID field.
// SignozLog.ID is stored as a log attribute in plogs for processing
// and gets hydrated back later.
const SignozLogIdAttr = "__signoz_log_id__"

func SignozLogsToPLogs(logs []model.SignozLog) []plog.Logs {
	result := []plog.Logs{}

	for _, log := range logs {
		pl := plog.NewLogs()
		rl := pl.ResourceLogs().AppendEmpty()

		resourceAttribs := rl.Resource().Attributes()
		for k, v := range log.Resources_string {
			resourceAttribs.PutStr(k, v)
		}

		scopeLog := rl.ScopeLogs().AppendEmpty()
		slRecord := scopeLog.LogRecords().AppendEmpty()

		slRecord.SetTimestamp(pcommon.NewTimestampFromTime(
			time.Unix(0, int64(log.Timestamp)),
		))

		var traceIdBuf [16]byte
		copy(traceIdBuf[:], []byte(log.TraceID))
		slRecord.SetTraceID(traceIdBuf)

		var spanIdBuf [8]byte
		copy(spanIdBuf[:], []byte(log.SpanID))
		slRecord.SetSpanID(spanIdBuf)

		slRecord.SetFlags(plog.LogRecordFlags(log.TraceFlags))

		slRecord.SetSeverityText(log.SeverityText)
		slRecord.SetSeverityNumber(plog.SeverityNumber(log.SeverityNumber))

		slRecord.Body().FromRaw(log.Body)

		slAttribs := slRecord.Attributes()
		for k, v := range log.Attributes_int64 {
			slAttribs.PutInt(k, v)
		}
		for k, v := range log.Attributes_float64 {
			slAttribs.PutDouble(k, v)
		}
		for k, v := range log.Attributes_string {
			slAttribs.PutStr(k, v)
		}
		slAttribs.PutStr(SignozLogIdAttr, log.ID)

		result = append(result, pl)
	}

	return result
}

func PLogsToSignozLogs(plogs []plog.Logs) []model.SignozLog {
	result := []model.SignozLog{}

	for _, pl := range plogs {

		resourceLogsSlice := pl.ResourceLogs()
		for i := 0; i < resourceLogsSlice.Len(); i++ {
			rl := resourceLogsSlice.At(i)

			scopeLogsSlice := rl.ScopeLogs()
			for j := 0; j < scopeLogsSlice.Len(); j++ {
				sl := scopeLogsSlice.At(j)

				lrSlice := sl.LogRecords()
				for k := 0; k < lrSlice.Len(); k++ {
					lr := lrSlice.At(k)

					// Recover ID for the log and remove temp attrib used for storing it
					signozLogId := ""
					logIdVal, exists := lr.Attributes().Get(SignozLogIdAttr)
					if exists {
						signozLogId = logIdVal.Str()
					}
					lr.Attributes().Remove(SignozLogIdAttr)

					signozLog := model.SignozLog{
						Timestamp:          uint64(lr.Timestamp()),
						ID:                 signozLogId,
						TraceID:            lr.TraceID().String(),
						SpanID:             lr.SpanID().String(),
						TraceFlags:         uint32(lr.Flags()),
						SeverityText:       lr.SeverityText(),
						SeverityNumber:     uint8(lr.SeverityNumber()),
						Body:               lr.Body().AsString(),
						Resources_string:   pMapToStrMap(rl.Resource().Attributes()),
						Attributes_string:  map[string]string{},
						Attributes_int64:   map[string]int64{},
						Attributes_float64: map[string]float64{},
					}

					// Populate signozLog.Attributes_...
					lr.Attributes().Range(func(k string, v pcommon.Value) bool {
						if v.Type() == pcommon.ValueTypeDouble {
							signozLog.Attributes_float64[k] = v.Double()
						} else if v.Type() == pcommon.ValueTypeInt {
							signozLog.Attributes_int64[k] = v.Int()
						} else {
							signozLog.Attributes_string[k] = v.AsString()
						}
						return true
					})

					result = append(result, signozLog)
				}
			}
		}
	}

	return result
}

func pMapToStrMap(pMap pcommon.Map) map[string]string {
	result := map[string]string{}
	pMap.Range(func(k string, v pcommon.Value) bool {
		result[k] = v.AsString()
		return true
	})
	return result
}
