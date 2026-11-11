package parityexec

import (
	"context"
	"strings"
	"testing"

	"github.com/fuseone-io/fusescope/pkg/querier"
	qbtypes "github.com/fuseone-io/fusescope/pkg/types/querybuildertypes/querybuildertypesv5"
	"github.com/fuseone-io/fusescope/pkg/valuer"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type span struct{ trace, id, parent, service, name, remote string }

// spans answers the boundary queries over a set of spans: a root count, the sample of a
// service's operation, and the parents named by (trace_id, span_id).
type spans struct {
	querier.Querier
	all      []span
	requests []qbtypes.QueryBuilderQuery[qbtypes.TraceAggregation]
}

func (s *spans) QueryRange(_ context.Context, _ valuer.UUID, req *qbtypes.QueryRangeRequest) (*qbtypes.QueryRangeResponse, error) {
	spec := req.CompositeQuery.Queries[0].Spec.(qbtypes.QueryBuilderQuery[qbtypes.TraceAggregation])
	s.requests = append(s.requests, spec)
	filter := spec.Filter.Expression
	if req.RequestType == qbtypes.RequestTypeScalar {
		roots := 0
		for _, sp := range s.all {
			if sp.parent == "" && strings.Contains(filter, "'"+sp.service+"'") && strings.Contains(filter, "'"+sp.name+"'") {
				roots++
			}
		}
		return &qbtypes.QueryRangeResponse{Data: qbtypes.QueryData{Results: []any{&qbtypes.ScalarData{Data: [][]any{{uint64(roots)}}}}}}, nil
	}
	var rows []*qbtypes.RawRow
	for _, sp := range s.all {
		var keep bool
		if strings.Contains(filter, "span_id = ") {
			keep = strings.Contains(filter, "(trace_id = '"+sp.trace+"' AND span_id = '"+sp.id+"')")
		} else {
			keep = sp.parent != "" && sp.remote == "unknown" && strings.Contains(filter, "'"+sp.service+"'") && strings.Contains(filter, "'"+sp.name+"'")
		}
		if keep && len(rows) < spec.Limit {
			rows = append(rows, &qbtypes.RawRow{Data: map[string]any{"trace_id": sp.trace, "span_id": sp.id, "parent_span_id": sp.parent, "service.name": sp.service}})
		}
	}
	return &qbtypes.QueryRangeResponse{Data: qbtypes.QueryData{Results: []any{&qbtypes.RawData{Rows: rows}}}}, nil
}

func confirm(t *testing.T, all []span) (bool, *spans) {
	t.Helper()
	s := &spans{all: all}
	ok, err := Evidencer{Querier: s, Org: org}.Boundary(context.Background(), Group{Start: 1, End: 2}, "back", "handle")
	require.NoError(t, err)
	return ok, s
}

func TestOneWitnessInAnotherServiceConfirmsTheBoundary(t *testing.T) {
	ok, s := confirm(t, []span{
		{"t2", "b0", "", "back", "start", "unknown"},
		{"t1", "f1", "", "front", "GET", "unknown"},
		{"t2", "b2", "b0", "back", "handle", "unknown"},   // its parent is in the same service: not a witness
		{"t3", "b3", "gone", "back", "handle", "unknown"}, // its parent is not found: not a witness
		{"t1", "b1", "f1", "back", "handle", "unknown"},
	})
	assert.True(t, ok)
	require.Len(t, s.requests, 3)
	sample := s.requests[1]
	assert.Contains(t, sample.Filter.Expression, "is_remote = 'unknown'")
	assert.Equal(t, 50, sample.Limit)
	require.Len(t, sample.Order, 2, "a deterministic sample")
	parents := s.requests[2].Filter.Expression
	assert.Contains(t, parents, "(trace_id = 't1' AND span_id = 'f1')", "a parent is its trace's span, never a span id alone")
	assert.Contains(t, parents, "(trace_id = 't3' AND span_id = 'gone')")
}

func TestARootOfTheOperationDeniesTheBoundary(t *testing.T) {
	ok, s := confirm(t, []span{
		{"t1", "f1", "", "front", "GET", "unknown"},
		{"t1", "b1", "f1", "back", "handle", "unknown"},
		{"t2", "b2", "", "back", "handle", "unknown"},
	})
	assert.False(t, ok, "a root is top-level on the engine too")
	assert.Len(t, s.requests, 1, "nothing more is asked")
}

func TestWithoutAWitnessTheBoundaryIsNotConfirmed(t *testing.T) {
	ok, _ := confirm(t, []span{
		{"t2", "b2", "b0", "back", "handle", "unknown"},
		{"t2", "b0", "", "back", "start", "unknown"},
		{"t3", "b3", "f3", "back", "handle", "yes"}, // a remote parent is top-level on the engine
		{"t3", "f3", "", "front", "GET", "unknown"},
	})
	assert.False(t, ok)
}
