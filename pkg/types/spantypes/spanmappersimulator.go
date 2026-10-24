package spantypes

import (
	"context"
	"maps"
	"sort"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"go.opentelemetry.io/collector/pdata/ptrace"
)

var (
	ErrCodeSpanMapperSimulationFailed  = errors.MustNewCode("span_mapper_simulation_failed")
	ErrCodeSpanMapperSimulationStopped = errors.MustNewCode("span_mapper_simulation_stopped")
)

const spanInputOrderAttr = "__signoz_input_idx__"

func SimulateSpanMappersProcessing(ctx context.Context, groups []*SpanMapperGroupWithMappers, spans []SpanMapperTestSpan) ([]SpanMapperTestSpan, []string, error) {
	enabled := filterEnabledGroupsWithMappers(groups)
	if len(enabled) < 1 {
		return spans, nil, nil
	}

	outputTraces, err := simulateSpanMappersOnPTraces(ctx, enabled, spanMapperInputPTraces(spans))
	if err != nil {
		return nil, nil, err
	}

	outputSpans, err := spanMapperOutputSpans(outputTraces, len(spans))
	if err != nil {
		return nil, nil, err
	}
	return outputSpans, nil, nil
}

// spanMapperInputPTraces tags each span with its request position so the
// output can be returned in input order; it works on copies so the caller's
// attribute maps stay untouched.
func spanMapperInputPTraces(spans []SpanMapperTestSpan) []ptrace.Traces {
	inputSpans := make([]SpanMapperTestSpan, len(spans))
	for i, s := range spans {
		attrs := make(map[string]any, len(s.Attributes)+1)
		maps.Copy(attrs, s.Attributes)
		attrs[spanInputOrderAttr] = int64(i)
		inputSpans[i] = SpanMapperTestSpan{Attributes: attrs, Resource: s.Resource}
	}
	return SpansToPTraces(inputSpans)
}

func simulateSpanMappersOnPTraces(ctx context.Context, enabled []*SpanMapperGroupWithMappers, simulatorInput []ptrace.Traces) ([]ptrace.Traces, error) {
	config := buildProcessorConfig(enabled)
	out := make([]ptrace.Traces, 0, len(simulatorInput))
	for _, in := range simulatorInput {
		if err := ctx.Err(); err != nil {
			return nil, errors.WrapCanceledf(err, ErrCodeSpanMapperSimulationStopped, "span mapper simulation stopped")
		}
		td := ptrace.NewTraces()
		in.CopyTo(td)
		applySpanMapperProcessor(config, td)
		out = append(out, td)
	}
	return out, nil
}

func spanMapperOutputSpans(outputTraces []ptrace.Traces, inputCount int) ([]SpanMapperTestSpan, error) {
	outputSpans := PTracesToSpans(outputTraces)

	if len(outputSpans) != inputCount {
		return nil, errors.Newf(errors.TypeInternal, ErrCodeSpanMapperSimulationFailed, "simulation returned %d spans for %d input spans", len(outputSpans), inputCount)
	}

	sort.Slice(outputSpans, func(i, j int) bool {
		iIdx, _ := outputSpans[i].Attributes[spanInputOrderAttr].(int64)
		jIdx, _ := outputSpans[j].Attributes[spanInputOrderAttr].(int64)
		return iIdx < jIdx
	})
	for _, s := range outputSpans {
		delete(s.Attributes, spanInputOrderAttr)
	}
	return outputSpans, nil
}

func SpansToPTraces(spans []SpanMapperTestSpan) []ptrace.Traces {
	result := make([]ptrace.Traces, 0, len(spans))
	for _, s := range spans {
		td := ptrace.NewTraces()
		rs := td.ResourceSpans().AppendEmpty()
		if s.Resource != nil {
			_ = rs.Resource().Attributes().FromRaw(s.Resource)
		}
		sl := rs.ScopeSpans().AppendEmpty()
		span := sl.Spans().AppendEmpty()
		if s.Attributes != nil {
			_ = span.Attributes().FromRaw(s.Attributes)
		}
		result = append(result, td)
	}
	return result
}

func PTracesToSpans(traces []ptrace.Traces) []SpanMapperTestSpan {
	result := []SpanMapperTestSpan{}
	for _, td := range traces {
		rss := td.ResourceSpans()
		for i := 0; i < rss.Len(); i++ {
			rs := rss.At(i)
			resourceAttrs := rs.Resource().Attributes().AsRaw()
			ilss := rs.ScopeSpans()
			for j := 0; j < ilss.Len(); j++ {
				spans := ilss.At(j).Spans()
				for k := 0; k < spans.Len(); k++ {
					result = append(result, SpanMapperTestSpan{
						Attributes: spans.At(k).Attributes().AsRaw(),
						Resource:   resourceAttrs,
					})
				}
			}
		}
	}
	return result
}

func filterEnabledGroupsWithMappers(groups []*SpanMapperGroupWithMappers) []*SpanMapperGroupWithMappers {
	out := make([]*SpanMapperGroupWithMappers, 0, len(groups))
	for _, gm := range groups {
		if gm == nil || gm.Group == nil || !gm.Group.Enabled {
			continue
		}
		enabled := make([]*SpanMapper, 0, len(gm.Mappers))
		for _, m := range gm.Mappers {
			if m != nil && m.Enabled {
				enabled = append(enabled, m)
			}
		}
		if len(enabled) > 0 {
			out = append(out, &SpanMapperGroupWithMappers{Group: gm.Group, Mappers: enabled})
		}
	}
	return out
}
