package parityexec

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/parity"
	"github.com/fuseone-io/fusescope/pkg/telemetrystore"
	"github.com/fuseone-io/fusescope/pkg/valuer"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

var org = valuer.GenerateUUID()

type recorded struct {
	graph    *Graph
	deadline time.Time
	pair     any
	subject  string
}

type recorder struct {
	mu    sync.Mutex
	calls []recorded
}

func (r *recorder) call(answer func(g *Graph, attempt int) (any, error)) Call {
	return func(ctx context.Context, g *Graph) (any, []string, error) {
		r.mu.Lock()
		deadline, _ := ctx.Deadline()
		identity, _ := telemetrystore.IdentityFromContext(telemetrystore.WithTenant(ctx, org))
		r.calls = append(r.calls, recorded{graph: g, deadline: deadline, pair: ctx.Value(pairKey{}), subject: identity.Subject})
		attempt := len(r.calls)
		r.mu.Unlock()
		a, err := answer(g, attempt)
		return a, nil, err
	}
}

func runner(refuser *Refuser) (Runner, *Graph) {
	engine := &Graph{}
	return Runner{Engine: engine, ClickHouse: &Graph{}, Refuser: refuser, Seed: 3, Deadline: time.Second, RetryWait: time.Millisecond}, engine
}

func TestEachSideGetsAFreshContextWithTheSameDeadline(t *testing.T) {
	r, _ := runner(NewRefuser())
	rec := &recorder{}
	result := r.Run(context.Background(), Pair{Index: 4, Call: rec.call(func(*Graph, int) (any, error) {
		time.Sleep(50 * time.Millisecond)
		return map[string]int{"data": 1}, nil
	})})
	require.Len(t, rec.calls, 2)
	assert.GreaterOrEqual(t, rec.calls[1].deadline.Sub(rec.calls[0].deadline), 50*time.Millisecond, "the second call never inherits the time the first used")
	for _, c := range rec.calls {
		assert.Equal(t, 4, c.pair, "a refused call is counted against its pair")
		assert.Equal(t, "service:parity", c.subject)
	}
	assert.True(t, result.Outcome.Compare)
	assert.Equal(t, map[string]any{"data": float64(1)}, result.Engine.Answer, "answers are read as JSON reads them")
	assert.Equal(t, 1, result.Attempts)
}

func TestTheOrderAlternatesHalfForEachSide(t *testing.T) {
	r, engine := runner(NewRefuser())
	first := map[bool]int{}
	for i := 0; i < 10; i++ {
		rec := &recorder{}
		result := r.Run(context.Background(), Pair{Index: i, Call: rec.call(func(*Graph, int) (any, error) { return 1, nil })})
		assert.Equal(t, rec.calls[0].graph == engine, result.EngineFirst)
		first[result.EngineFirst]++
	}
	assert.Equal(t, map[bool]int{true: 5, false: 5}, first)

	r.Seed++
	assert.NotEqual(t, (Runner{Seed: 3}).engineFirst(0), r.engineFirst(0), "the seed moves the order")
}

func TestATimeoutIsRetriedOnceWithFreshContexts(t *testing.T) {
	r, engine := runner(NewRefuser())
	slow := errors.Newf(errors.TypeTimeout, errors.CodeTimeout, "slow")
	rec := &recorder{}
	result := r.Run(context.Background(), Pair{Index: 1, Call: rec.call(func(g *Graph, attempt int) (any, error) {
		if g == engine && attempt <= 2 {
			return nil, slow
		}
		return 1, nil
	})})
	assert.Equal(t, 2, result.Attempts)
	assert.True(t, result.Outcome.Compare, "the retry answered")
	require.Len(t, rec.calls, 4)
	assert.True(t, rec.calls[2].deadline.After(rec.calls[0].deadline))

	rec = &recorder{}
	result = r.Run(context.Background(), Pair{Index: 1, Call: rec.call(func(g *Graph, _ int) (any, error) {
		if g == engine {
			return nil, slow
		}
		return 1, nil
	})})
	assert.Equal(t, 2, result.Attempts, "once, not more")
	assert.Equal(t, &parity.Verdict{Category: parity.CategoryTimeout, Disposition: parity.Inconclusive}, result.Outcome.Verdict)
}

func TestAPairThatTouchedClickhouseFromTheEngineGraphIsAFallback(t *testing.T) {
	refuser := NewRefuser()
	r, engine := runner(refuser)
	rec := &recorder{}
	result := r.Run(context.Background(), Pair{Index: 9, Call: func(ctx context.Context, g *Graph) (any, []string, error) {
		if g == engine {
			_, _ = refuser.ClickhouseDB().Query(ctx, "SELECT 1")
		}
		return rec.call(func(*Graph, int) (any, error) { return 1, nil })(ctx, g)
	}})
	assert.Equal(t, &parity.Verdict{Category: parity.CategoryFallbackAttempted, Disposition: parity.Blocking}, result.Outcome.Verdict)
}

func TestACanceledRoundStopsThePair(t *testing.T) {
	r, _ := runner(NewRefuser())
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	result := r.Run(ctx, Pair{Index: 0, Call: func(ctx context.Context, _ *Graph) (any, []string, error) { return nil, nil, ctx.Err() }})
	assert.True(t, result.Outcome.Canceled)
}
