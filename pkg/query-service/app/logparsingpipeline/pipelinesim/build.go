package pipelinesim

import (
	"maps"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/open-telemetry/opentelemetry-collector-contrib/pkg/stanza/operator"
	"github.com/open-telemetry/opentelemetry-collector-contrib/pkg/stanza/operator/helper"
	"github.com/open-telemetry/opentelemetry-collector-contrib/pkg/stanza/operator/parser/regex"
	"github.com/open-telemetry/opentelemetry-collector-contrib/pkg/stanza/operator/parser/severity"
	stanzatime "github.com/open-telemetry/opentelemetry-collector-contrib/pkg/stanza/operator/parser/time"
	"github.com/open-telemetry/opentelemetry-collector-contrib/pkg/stanza/operator/parser/trace"
	"github.com/open-telemetry/opentelemetry-collector-contrib/pkg/stanza/operator/transformer/copy"
	"github.com/open-telemetry/opentelemetry-collector-contrib/pkg/stanza/operator/transformer/move"
	"github.com/open-telemetry/opentelemetry-collector-contrib/pkg/stanza/operator/transformer/remove"
	"go.opentelemetry.io/collector/component"
	"go.opentelemetry.io/collector/component/componenttest"
	"go.opentelemetry.io/collector/confmap"
)

const (
	routerType = "router"
	noopType   = "noop"
	sinkID     = "__pipelinesim_sink__"
)

// builders lists the operator types the logs pipeline processor accepts.
var builders = map[string]func() operator.Builder{
	"add":             newAddConfig,
	"copy":            func() operator.Builder { return copy.NewConfig() },
	"grok_parser":     newGrokConfig,
	"json_parser":     newJSONConfig,
	"move":            func() operator.Builder { return move.NewConfig() },
	"normalize":       newNormalizeConfig,
	"regex_parser":    func() operator.Builder { return regex.NewConfig() },
	"remove":          func() operator.Builder { return remove.NewConfig() },
	"severity_parser": func() operator.Builder { return severity.NewConfig() },
	"time_parser":     func() operator.Builder { return newTimeConfig() },
	"trace_parser":    func() operator.Builder { return trace.NewConfig() },
}

type operatorSpec struct {
	id     string
	typ    string
	next   string
	config map[string]any
}

func buildPipeline(p Processor) (*pipeline, error) {
	specs, err := operatorSpecs(p)
	if err != nil {
		return nil, err
	}

	built := &pipeline{first: processorOutput, nodes: make(map[string]node, len(specs))}
	if len(specs) > 0 {
		built.first = specs[0].id
	}
	for _, spec := range specs {
		n, err := buildNode(spec)
		if err != nil {
			return nil, err
		}
		built.nodes[spec.id] = n
	}
	if err := checkGraph(p.Name, specs); err != nil {
		return nil, err
	}
	return built, nil
}

func operatorSpecs(p Processor) ([]operatorSpec, error) {
	specs := make([]operatorSpec, 0, len(p.Operators))
	ids := map[string]bool{}
	for _, raw := range p.Operators {
		config := maps.Clone(raw)
		typ, ok := config["type"].(string)
		if !ok || typ == "" {
			return nil, errors.NewInvalidInputf(CodeInvalidConfig, "processor %s: operator without a type", p.Name)
		}
		if _, known := builders[typ]; !known && typ != routerType && typ != noopType {
			return nil, errors.NewInvalidInputf(CodeInvalidConfig, "processor %s: unsupported operator type %q", p.Name, typ)
		}
		id, _ := config["id"].(string)
		if id == "" {
			id = typ
		}
		if ids[id] {
			return nil, errors.NewInternalf(CodeBuildFailed, "processor %s: duplicate operator id %q", p.Name, id)
		}
		ids[id] = true

		next, _ := config["output"].(string)
		delete(config, "output")
		specs = append(specs, operatorSpec{id: id, typ: typ, next: next, config: config})
	}
	for i := range specs {
		if specs[i].next == "" && i+1 < len(specs) {
			specs[i].next = specs[i+1].id
		}
	}
	return specs, nil
}

func buildNode(spec operatorSpec) (node, error) {
	switch spec.typ {
	case noopType:
		return &noopNode{next: spec.next}, nil
	case routerType:
		return buildRouter(spec)
	}

	config := maps.Clone(spec.config)
	var when *condition
	if expression, _ := config["if"].(string); expression != "" {
		var err error
		if when, err = newCondition(expression); err != nil {
			return nil, errors.WrapInternalf(err, CodeBuildFailed, "operator %s: compile if expression", spec.id)
		}
	}
	delete(config, "if")
	onError, _ := config["on_error"].(string)
	if onError == "" {
		onError = helper.SendOnError
	}

	builder := builders[spec.typ]()
	if err := confmap.NewFromStringMap(config).Unmarshal(builder, confmap.WithIgnoreUnused()); err != nil {
		return nil, errors.WrapInvalidInputf(err, CodeInvalidConfig, "operator %s: decode config", spec.id)
	}
	op, err := builder.Build(componenttest.NewNopTelemetrySettings())
	if err != nil {
		return nil, errors.WrapInternalf(err, CodeBuildFailed, "operator %s: build", spec.id)
	}

	out, err := newSink()
	if err != nil {
		return nil, err
	}
	op.SetOutputIDs([]string{sinkID})
	if err := op.SetOutputs([]operator.Operator{out}); err != nil {
		return nil, errors.WrapInternalf(err, CodeBuildFailed, "operator %s: connect output", spec.id)
	}
	return &stanzaNode{id: spec.id, op: op, sink: out, when: when, onError: onError, next: spec.next}, nil
}

func buildRouter(spec operatorSpec) (node, error) {
	n := &routerNode{}
	if def, ok := spec.config["default"].(string); ok && def != "" {
		n.defaultOutput, n.hasDefault = def, true
	}
	routes, _ := spec.config["routes"].([]any)
	for i, raw := range routes {
		r, _ := raw.(map[string]any)
		expression, _ := r["expr"].(string)
		output, _ := r["output"].(string)
		when, err := newCondition(expression)
		if err != nil {
			return nil, errors.WrapInternalf(err, CodeBuildFailed, "router %s: compile route %d", spec.id, i)
		}
		n.routes = append(n.routes, route{when: when, output: output})
	}
	return n, nil
}

func newSink() (*sink, error) {
	out, err := helper.NewOutputConfig(sinkID, "sink").Build(componenttest.NewNopTelemetrySettings())
	if err != nil {
		return nil, errors.WrapInternalf(err, CodeBuildFailed, "build operator output")
	}
	return &sink{OutputOperator: out}, nil
}

// checkGraph requires every output to name an operator of the processor and
// the operators not to form a cycle.
func checkGraph(processor string, specs []operatorSpec) error {
	outputs := make(map[string][]string, len(specs))
	for _, spec := range specs {
		outputs[spec.id] = nodeOutputs(spec)
	}
	const (
		unvisited = iota
		visiting
		done
	)
	state := map[string]int{}
	var visit func(id string) error
	visit = func(id string) error {
		switch state[id] {
		case visiting:
			return errors.NewInternalf(CodeBuildFailed, "processor %s: operators form a cycle at %q", processor, id)
		case done:
			return nil
		}
		state[id] = visiting
		for _, next := range outputs[id] {
			if next == processorOutput {
				continue
			}
			if _, ok := outputs[next]; !ok {
				return errors.NewInternalf(CodeBuildFailed, "processor %s: operator %q outputs to unknown operator %q", processor, id, next)
			}
			if err := visit(next); err != nil {
				return err
			}
		}
		state[id] = done
		return nil
	}
	for _, spec := range specs {
		if err := visit(spec.id); err != nil {
			return err
		}
	}
	return nil
}

func nodeOutputs(spec operatorSpec) []string {
	if spec.typ != routerType {
		return []string{spec.next}
	}
	outputs := []string{}
	if def, ok := spec.config["default"].(string); ok && def != "" {
		outputs = append(outputs, def)
	}
	routes, _ := spec.config["routes"].([]any)
	for _, raw := range routes {
		r, _ := raw.(map[string]any)
		output, _ := r["output"].(string)
		outputs = append(outputs, output)
	}
	return outputs
}

// newTimeConfig parses layouts without a zone in UTC, as the collector runs.
func newTimeConfig() *timeConfig {
	return &timeConfig{Config: *stanzatime.NewConfig()}
}

type timeConfig struct {
	stanzatime.Config `mapstructure:",squash"`
}

func (c *timeConfig) Build(set component.TelemetrySettings) (operator.Operator, error) {
	if c.Location == "" {
		c.Location = "UTC"
	}
	return c.Config.Build(set)
}
