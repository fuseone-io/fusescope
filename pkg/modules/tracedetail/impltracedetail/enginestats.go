package impltracedetail

import (
	"context"
	"strconv"
	"strings"
	"time"

	"github.com/fuseone-io/fusescope/pkg/flagger"
	"github.com/fuseone-io/fusescope/pkg/querybuilder"
	"github.com/fuseone-io/fusescope/pkg/semconv"
	"github.com/fuseone-io/fusescope/pkg/types/aiobservabilitytypes"
	"github.com/fuseone-io/fusescope/pkg/types/spantypes"
	"github.com/fuseone-io/fusescope/pkg/types/telemetrytypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
)

const missingSpanName = "Missing Span"

// genAIKeys are the attribute spellings the summary reads, current first, as the ClickHouse
// summary resolves them.
type genAIKeys struct {
	gate                                                     [][]string
	input, output, cacheRead, cacheWrite, reasoning, costKey []string
}

func genAIKeysFor(ctx context.Context, orgID valuer.UUID, fl flagger.Flagger) genAIKeys {
	families := querybuilder.SemconvFamiliesEnabled(ctx, orgID, fl)
	spellings := func(name string) []string {
		if !families {
			return []string{name}
		}
		return semconv.Members(semconv.KindAttribute, telemetrytypes.FieldKeySelector{Name: name, Signal: telemetrytypes.SignalTraces, FieldContext: telemetrytypes.FieldContextAttribute})
	}
	keys := genAIKeys{
		input:      spellings(aiobservabilitytypes.GenAIUsageInputTokens),
		output:     spellings(aiobservabilitytypes.GenAIUsageOutputTokens),
		cacheRead:  spellings(aiobservabilitytypes.GenAIUsageCacheReadInputTokens),
		cacheWrite: spellings(aiobservabilitytypes.GenAIUsageCacheCreationInputTokens),
		reasoning:  spellings(aiobservabilitytypes.GenAIUsageReasoningOutputTokens),
		costKey:    spellings(aiobservabilitytypes.SignozGenAITotalCost),
	}
	for _, name := range aiobservabilitytypes.GenAISpanGateKeys {
		keys.gate = append(keys.gate, spellings(name))
	}
	return keys
}

// inTraceOrder orders by time, then name, as the ClickHouse summary picks its root.
func inTraceOrder(aAt, bAt int64, aName, bName string) int {
	if aAt != bAt {
		if aAt < bAt {
			return -1
		}
		return 1
	}
	return strings.Compare(aName, bName)
}

// rootCandidate is a span that can name the trace: one without a parent, or one whose parent is
// absent, which names it "Missing Span".
type rootCandidate struct {
	start                time.Time
	name, service, state string
}

func (c rootCandidate) before(o rootCandidate) bool {
	return inTraceOrder(c.start.UnixNano(), o.start.UnixNano(), c.name, o.name) < 0
}

// child is a span with a parent, kept until the parent is known to be present or absent.
type child struct {
	parent string
	start  time.Time
}

// statsAccumulator computes what the ClickHouse summary computes, a span at a time. It keeps only
// ids, parents and start times; a span's maps are dropped once read.
type statsAccumulator struct {
	keys     genAIKeys
	seen     map[string]struct{}
	children map[string]child
	root     *rootCandidate
	sum      spantypes.TraceStats
	cost     float64
	hasCost  bool
}

func newStatsAccumulator(keys genAIKeys) *statsAccumulator {
	return &statsAccumulator{keys: keys, seen: map[string]struct{}{}, children: map[string]child{}}
}

func (a *statsAccumulator) add(row map[string]any) {
	span := storableSpanOf(row, false)
	if _, dup := a.seen[span.SpanID]; dup {
		return
	}
	a.seen[span.SpanID] = struct{}{}

	start := uint64(span.StartTime.UnixNano())
	if a.sum.TotalSpans == 0 || start < a.sum.StartNs {
		a.sum.StartNs = start
	}
	a.sum.EndNs = max(a.sum.EndNs, start+span.DurationNano)
	a.sum.TotalSpans++
	if span.HasError {
		a.sum.TotalErrorSpans++
	}

	if span.ParentSpanID == "" {
		a.offerRoot(rootCandidate{start: span.StartTime, name: span.Name, service: span.ServiceName, state: span.ResponseStatusCode})
	} else {
		a.children[span.SpanID] = child{parent: span.ParentSpanID, start: span.StartTime}
	}
	a.addGenAI(&span)
}

func (a *statsAccumulator) offerRoot(c rootCandidate) {
	if a.root == nil || c.before(*a.root) {
		a.root = &c
	}
}

func (a *statsAccumulator) addGenAI(span *spantypes.StorableSpan) {
	for _, spellings := range a.keys.gate {
		if hasAttribute(span, spellings) {
			a.sum.GenAISpanCount++
			break
		}
	}
	a.sum.Tokens.Input += tokens(span, a.keys.input)
	a.sum.Tokens.Output += tokens(span, a.keys.output)
	a.sum.Tokens.CacheRead += tokens(span, a.keys.cacheRead)
	a.sum.Tokens.CacheWrite += tokens(span, a.keys.cacheWrite)
	a.sum.Tokens.Reasoning += tokens(span, a.keys.reasoning)
	if cost, ok := number(span, a.keys.costKey); ok {
		a.cost += cost
		a.hasCost = true
	}
}

// result finishes the summary: a span whose parent never arrived is a missing span and a root.
func (a *statsAccumulator) result() *spantypes.TraceStats {
	for _, c := range a.children {
		if _, present := a.seen[c.parent]; !present {
			a.sum.HasMissingSpans = true
			a.offerRoot(rootCandidate{start: c.start, name: missingSpanName})
		}
	}
	if a.root != nil {
		a.sum.RootServiceName, a.sum.RootEntryPoint, a.sum.RootSpanStatusCode = a.root.service, a.root.name, a.root.state
	}
	if a.hasCost {
		cost := a.cost
		a.sum.TotalCost = &cost
	}
	stats := a.sum
	return &stats
}

func hasAttribute(span *spantypes.StorableSpan, spellings []string) bool {
	for _, key := range spellings {
		if _, ok := span.AttributesString[key]; ok {
			return true
		}
		if _, ok := span.AttributesNumber[key]; ok {
			return true
		}
		if _, ok := span.AttributesBool[key]; ok {
			return true
		}
	}
	return false
}

// number is the first spelling present, read as a number whether it was stored as one or as text.
func number(span *spantypes.StorableSpan, spellings []string) (float64, bool) {
	for _, key := range spellings {
		if v, ok := span.AttributesNumber[key]; ok {
			return v, true
		}
		if s, ok := span.AttributesString[key]; ok {
			if v, err := strconv.ParseFloat(s, 64); err == nil {
				return v, true
			}
		}
	}
	return 0, false
}

func tokens(span *spantypes.StorableSpan, spellings []string) uint64 {
	v, ok := number(span, spellings)
	if !ok || v < 0 {
		return 0
	}
	return uint64(v)
}
