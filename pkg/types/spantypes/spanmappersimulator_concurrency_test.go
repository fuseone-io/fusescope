package spantypes

import (
	"context"
	"fmt"
	"sync"
	"testing"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestSimulateSpanMappersProcessing_Concurrent(t *testing.T) {
	groups := []*SpanMapperGroupWithMappers{{
		Group: &SpanMapperGroup{
			Name:      "g",
			Condition: SpanMapperGroupCondition{Attributes: userConditionKeys([]string{"src"})},
			Enabled:   true,
		},
		Mappers: []*SpanMapper{{
			Name:         "target",
			FieldContext: FieldContextSpanAttribute,
			Config: SpanMapperConfig{Sources: []SpanMapperSource{
				{Key: "src", Context: FieldContextSpanAttribute, Operation: SpanMapperOperationMove, Priority: 1, Enabled: true, Origin: SpanMapperOriginUser},
			}},
			Enabled: true,
		}},
	}}

	var wg sync.WaitGroup
	for i := range 32 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			value := fmt.Sprintf("v%d", i)
			out, _, err := SimulateSpanMappersProcessing(context.Background(), groups, []SpanMapperTestSpan{{Attributes: map[string]any{"src": value}}})
			if !assert.NoError(t, err) || !assert.Len(t, out, 1) {
				return
			}
			assert.Equal(t, map[string]any{"target": value}, out[0].Attributes)
		}()
	}
	wg.Wait()
}

func TestSimulateSpanMappersProcessing_Canceled(t *testing.T) {
	groups := []*SpanMapperGroupWithMappers{{
		Group: &SpanMapperGroup{
			Name:      "g",
			Condition: SpanMapperGroupCondition{Attributes: userConditionKeys([]string{"src"})},
			Enabled:   true,
		},
		Mappers: []*SpanMapper{{
			Name:         "target",
			FieldContext: FieldContextSpanAttribute,
			Config: SpanMapperConfig{Sources: []SpanMapperSource{
				{Key: "src", Context: FieldContextSpanAttribute, Operation: SpanMapperOperationCopy, Priority: 1, Enabled: true, Origin: SpanMapperOriginUser},
			}},
			Enabled: true,
		}},
	}}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	_, _, err := SimulateSpanMappersProcessing(ctx, groups, []SpanMapperTestSpan{{Attributes: map[string]any{"src": "a"}}})

	require.Error(t, err)
	assert.True(t, errors.Ast(err, errors.TypeCanceled), "got %v", err)
}

func TestSimulateSpanMappersProcessing_DoesNotMutateInput(t *testing.T) {
	groups := []*SpanMapperGroupWithMappers{{
		Group: &SpanMapperGroup{
			Name:      "g",
			Condition: SpanMapperGroupCondition{Attributes: userConditionKeys([]string{"src"})},
			Enabled:   true,
		},
		Mappers: []*SpanMapper{{
			Name:         "target",
			FieldContext: FieldContextResource,
			Config: SpanMapperConfig{Sources: []SpanMapperSource{
				{Key: "src", Context: FieldContextSpanAttribute, Operation: SpanMapperOperationMove, Priority: 1, Enabled: true, Origin: SpanMapperOriginUser},
			}},
			Enabled: true,
		}},
	}}
	spans := []SpanMapperTestSpan{{Attributes: map[string]any{"src": "a"}, Resource: map[string]any{"service.name": "s"}}}

	out, _, err := SimulateSpanMappersProcessing(context.Background(), groups, spans)

	require.NoError(t, err)
	require.Len(t, out, 1)
	assert.Equal(t, map[string]any{}, out[0].Attributes)
	assert.Equal(t, map[string]any{"service.name": "s", "target": "a"}, out[0].Resource)
	assert.Equal(t, map[string]any{"src": "a"}, spans[0].Attributes)
	assert.Equal(t, map[string]any{"service.name": "s"}, spans[0].Resource)
}
