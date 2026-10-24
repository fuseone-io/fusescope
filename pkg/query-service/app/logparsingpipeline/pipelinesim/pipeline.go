package pipelinesim

import (
	"context"

	"github.com/expr-lang/expr/vm"
	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/query-service/app/logparsingpipeline/pipelineexpr"
	"github.com/open-telemetry/opentelemetry-collector-contrib/pkg/stanza/entry"
	"github.com/open-telemetry/opentelemetry-collector-contrib/pkg/stanza/operator"
	"github.com/open-telemetry/opentelemetry-collector-contrib/pkg/stanza/operator/helper"
)

// processorOutput is the next hop of an entry that leaves the processor.
const processorOutput = ""

type routedEntry struct {
	entry *entry.Entry
	next  string
}

type node interface {
	process(ctx context.Context, e *entry.Entry, r *report) []routedEntry
}

type pipeline struct {
	first string
	nodes map[string]node
}

func (p *pipeline) run(ctx context.Context, entries []*entry.Entry, r *report) ([]*entry.Entry, error) {
	out := []*entry.Entry{}
	for _, e := range entries {
		if err := ctx.Err(); err != nil {
			return nil, errors.WrapCanceledf(err, CodeSimulationStop, "logs pipeline simulation stopped")
		}
		pending := []routedEntry{{entry: e, next: p.first}}
		for len(pending) > 0 {
			current := pending[len(pending)-1]
			pending = pending[:len(pending)-1]
			if current.next == processorOutput {
				pipelineexpr.ForgetParsedBody(current.entry)
				out = append(out, current.entry)
				continue
			}
			pending = append(pending, p.nodes[current.next].process(ctx, current.entry, r)...)
		}
	}
	return out, nil
}

type condition struct {
	program  *vm.Program
	refsBody bool
}

func newCondition(expression string) (*condition, error) {
	program, refsBody, err := pipelineexpr.CompileBool(expression)
	if err != nil {
		return nil, err
	}
	return &condition{program: program, refsBody: refsBody}, nil
}

func (c *condition) matches(e *entry.Entry) (bool, error) {
	result, err := vm.Run(c.program, pipelineexpr.Env(e, c.refsBody))
	if err != nil {
		return false, err
	}
	return result.(bool), nil
}

// stanzaNode runs a stanza operator whose output is a sink, evaluating the
// operator's `if` itself so it sees the pipeline expression environment.
type stanzaNode struct {
	id      string
	op      operator.Operator
	sink    *sink
	when    *condition
	onError string
	next    string
}

func (n *stanzaNode) process(ctx context.Context, e *entry.Entry, r *report) []routedEntry {
	if n.when != nil {
		matches, err := n.when.matches(e)
		if err != nil {
			return n.failed(e, err, r)
		}
		if !matches {
			return []routedEntry{{entry: e, next: n.next}}
		}
	}

	n.sink.entries = n.sink.entries[:0]
	if err := n.op.Process(ctx, e); err != nil && !n.quiet() {
		r.add(n.id, err)
	}
	routed := make([]routedEntry, 0, len(n.sink.entries))
	for _, emitted := range n.sink.entries {
		routed = append(routed, routedEntry{entry: emitted, next: n.next})
	}
	return routed
}

func (n *stanzaNode) failed(e *entry.Entry, err error, r *report) []routedEntry {
	if !n.quiet() {
		r.add(n.id, err)
	}
	if n.onError == helper.SendOnError || n.onError == helper.SendOnErrorQuiet {
		return []routedEntry{{entry: e, next: n.next}}
	}
	return nil
}

func (n *stanzaNode) quiet() bool {
	return n.onError == helper.SendOnErrorQuiet || n.onError == helper.DropOnErrorQuiet
}

type route struct {
	when   *condition
	output string
}

// routerNode sends an entry to the first route whose expression matches,
// or to the default; an expression that fails to run does not match.
type routerNode struct {
	routes        []route
	defaultOutput string
	hasDefault    bool
}

func (n *routerNode) process(_ context.Context, e *entry.Entry, _ *report) []routedEntry {
	for _, rt := range n.routes {
		if matches, err := rt.when.matches(e); err == nil && matches {
			return []routedEntry{{entry: e, next: rt.output}}
		}
	}
	if n.hasDefault {
		return []routedEntry{{entry: e, next: n.defaultOutput}}
	}
	return nil
}

type noopNode struct {
	next string
}

func (n *noopNode) process(_ context.Context, e *entry.Entry, _ *report) []routedEntry {
	return []routedEntry{{entry: e, next: n.next}}
}

type sink struct {
	helper.OutputOperator
	entries []*entry.Entry
}

func (s *sink) Process(_ context.Context, e *entry.Entry) error {
	s.entries = append(s.entries, e)
	return nil
}

func (s *sink) ProcessBatch(_ context.Context, entries []*entry.Entry) error {
	s.entries = append(s.entries, entries...)
	return nil
}
