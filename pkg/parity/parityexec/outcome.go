package parityexec

import (
	"context"
	"slices"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/parity"
	"github.com/fuseone-io/fusescope/pkg/querybuilder"
	"github.com/fuseone-io/fusescope/pkg/telemetrystore"
	"github.com/fuseone-io/fusescope/pkg/types/spantypes"
)

// Side is what one graph returned for a pair: the answer as JSON reads it, the warnings of a
// partial answer, or an error.
type Side struct {
	Answer   any
	Warnings []string
	Err      error
}

// Outcome is what a pair's two sides mean: compare them, count a shared failure by its type, run
// the pair again after a first timeout, or record a verdict without comparing. A canceled pair is
// neither a difference nor a result.
type Outcome struct {
	Compare    bool
	BothFailed string
	Verdict    *parity.Verdict
	Retry      bool
	// Requeue is a pair to run again next round, after a partial engine answer.
	Requeue  bool
	Canceled bool
}

var partialWarnings = []string{
	telemetrystore.PartialWarning(telemetrystore.PartialIngesterUnavailable),
	telemetrystore.PartialWarning(telemetrystore.PartialUnknown),
}

// Decide applies the outcome matrix. A ClickHouse call by the engine graph overrides everything:
// whatever the engine answered, it did not answer alone.
func Decide(engine, clickhouse Side, touched, retried bool) Outcome {
	verdict := func(c parity.Category, d parity.Disposition) Outcome {
		return Outcome{Verdict: &parity.Verdict{Category: c, Disposition: d}}
	}
	switch {
	case touched:
		return verdict(parity.CategoryFallbackAttempted, parity.Blocking)
	case hasCode(engine.Err, querybuilder.ErrCodeUnsupportedDialect):
		return verdict(parity.CategoryCoverageGap, parity.Blocking)
	case errors.Is(engine.Err, context.Canceled) || errors.Is(clickhouse.Err, context.Canceled):
		return Outcome{Canceled: true}
	case isTimeout(engine.Err) || isTimeout(clickhouse.Err):
		if !retried {
			return Outcome{Retry: true}
		}
		return verdict(parity.CategoryTimeout, parity.Inconclusive)
	case engine.Err == nil && slices.ContainsFunc(engine.Warnings, func(w string) bool { return slices.Contains(partialWarnings, w) }):
		out := verdict(parity.CategoryPartial, parity.Inconclusive)
		out.Requeue = true
		return out
	case engine.Err != nil && clickhouse.Err != nil:
		if e, c := typeOf(engine.Err), typeOf(clickhouse.Err); e == c {
			return Outcome{BothFailed: e}
		}
		return verdict(parity.CategoryAsymmetricFailure, parity.Blocking)
	case hasCode(engine.Err, spantypes.ErrCodeTraceTooLarge):
		return verdict(parity.CategoryLimit, parity.Accepted)
	case engine.Err != nil || clickhouse.Err != nil:
		return verdict(parity.CategoryAsymmetricFailure, parity.Blocking)
	}
	return Outcome{Compare: true}
}

// hasCode is errors.Asc, which does not take a nil error.
func hasCode(err error, code errors.Code) bool {
	return err != nil && errors.Asc(err, code)
}

func isTimeout(err error) bool {
	return err != nil && (errors.Is(err, context.DeadlineExceeded) || errors.Ast(err, errors.TypeTimeout))
}

func typeOf(err error) string {
	t, _, _, _, _, _ := errors.Unwrapb(err)
	return t.String()
}
