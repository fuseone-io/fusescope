package parityexec

import (
	"context"
	"testing"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/parity"
	"github.com/fuseone-io/fusescope/pkg/querybuilder"
	"github.com/fuseone-io/fusescope/pkg/telemetrystore"
	"github.com/fuseone-io/fusescope/pkg/types/spantypes"
	"github.com/stretchr/testify/assert"
)

func verdict(c parity.Category, d parity.Disposition) *parity.Verdict {
	return &parity.Verdict{Category: c, Disposition: d}
}

var (
	answered = Side{Answer: map[string]any{"data": 1}}
	internal = Side{Err: errors.Newf(errors.TypeInternal, errors.CodeInternal, "boom")}
	invalid  = Side{Err: errors.Newf(errors.TypeInvalidInput, errors.CodeInvalidInput, "bad")}
	timedOut = Side{Err: errors.Newf(errors.TypeTimeout, errors.CodeTimeout, "slow")}
)

func TestTheOutcomeMatrix(t *testing.T) {
	tooLarge := Side{Err: errors.Newf(errors.TypePayloadTooLarge, spantypes.ErrCodeTraceTooLarge, "big")}
	gap := Side{Err: errors.NewInvalidInputf(querybuilder.ErrCodeUnsupportedDialect, "no form")}
	partial := Side{Answer: 1, Warnings: []string{telemetrystore.PartialWarning(telemetrystore.PartialIngesterUnavailable)}}
	unknownPartial := Side{Answer: 1, Warnings: []string{telemetrystore.PartialWarning(telemetrystore.PartialUnknown)}}
	deadline := Side{Err: context.DeadlineExceeded}

	cases := map[string]struct {
		engine, clickhouse Side
		touched, retried   bool
		want               Outcome
	}{
		"both answer":             {engine: answered, clickhouse: answered, want: Outcome{Compare: true}},
		"both fail alike":         {engine: internal, clickhouse: internal, want: Outcome{BothFailed: "internal"}},
		"both fail differently":   {engine: internal, clickhouse: invalid, want: Outcome{Verdict: verdict(parity.CategoryAsymmetricFailure, parity.Blocking)}},
		"engine fails alone":      {engine: internal, clickhouse: answered, want: Outcome{Verdict: verdict(parity.CategoryAsymmetricFailure, parity.Blocking)}},
		"clickhouse fails alone":  {engine: answered, clickhouse: internal, want: Outcome{Verdict: verdict(parity.CategoryAsymmetricFailure, parity.Blocking)}},
		"a trace past max_rows":   {engine: tooLarge, clickhouse: answered, want: Outcome{Verdict: verdict(parity.CategoryLimit, parity.Accepted)}},
		"too large both sides":    {engine: tooLarge, clickhouse: tooLarge, want: Outcome{BothFailed: "payload-too-large"}},
		"a first timeout":         {engine: timedOut, clickhouse: answered, want: Outcome{Retry: true}},
		"a deadline":              {engine: answered, clickhouse: deadline, want: Outcome{Retry: true}},
		"a timeout after a retry": {engine: timedOut, clickhouse: answered, retried: true, want: Outcome{Verdict: verdict(parity.CategoryTimeout, parity.Inconclusive)}},
		"a partial answer":        {engine: partial, clickhouse: answered, want: Outcome{Verdict: verdict(parity.CategoryPartial, parity.Inconclusive), Requeue: true}},
		"an unknown partial":      {engine: unknownPartial, clickhouse: answered, want: Outcome{Verdict: verdict(parity.CategoryPartial, parity.Inconclusive), Requeue: true}},
		"a coverage gap":          {engine: gap, clickhouse: answered, want: Outcome{Verdict: verdict(parity.CategoryCoverageGap, parity.Blocking)}},
		"a fallback":              {engine: answered, clickhouse: answered, touched: true, want: Outcome{Verdict: verdict(parity.CategoryFallbackAttempted, parity.Blocking)}},
		"a fallback that failed":  {engine: internal, clickhouse: answered, touched: true, want: Outcome{Verdict: verdict(parity.CategoryFallbackAttempted, parity.Blocking)}},
		"a fallback over a gap":   {engine: gap, clickhouse: answered, touched: true, want: Outcome{Verdict: verdict(parity.CategoryFallbackAttempted, parity.Blocking)}},
		"a canceled round":        {engine: Side{Err: context.Canceled}, clickhouse: answered, want: Outcome{Canceled: true}},
	}
	for name, c := range cases {
		assert.Equal(t, c.want, Decide(c.engine, c.clickhouse, c.touched, c.retried), name)
	}
}
