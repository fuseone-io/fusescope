// Package parity compares the answers of the trace views on ClickHouse and on fusescope-engine
// and says, for every difference, what it is and what it means for the exit of phase 1.
package parity

// Category says what a difference is.
type Category string

// Disposition says what a difference means for the exit: an accepted one does not count, a
// blocking one stops the exit while it occurs, an inconclusive one did not decide and counts
// against the inconclusive budget.
type Disposition string

const (
	Accepted     Disposition = "accepted"
	Blocking     Disposition = "blocking"
	Inconclusive Disposition = "inconclusive"
)

// Verdict is the category and the disposition of one difference.
type Verdict struct {
	Category    Category
	Disposition Disposition
}

const (
	// CategoryApproximation is a quantile the two stores estimate differently.
	CategoryApproximation Category = "approximation"
	// CategoryRows is a different set of rows or groups.
	CategoryRows Category = "rows"
	// CategoryDerivedColumn is a derived span column the engine does not keep yet, empty where
	// ClickHouse has a value (D6).
	CategoryDerivedColumn Category = "derived_column"
	// CategoryServiceBoundary is a top-level operation or entry point ClickHouse counts for a span
	// whose parent is in another service (D7).
	CategoryServiceBoundary Category = "service_boundary"
	// CategoryAbsentKey is an absent promoted key read differently: a null against an empty string,
	// or the rows a filter on it keeps (D8).
	CategoryAbsentKey Category = "absent_key"
	// CategoryOrder is a contractual order that differs.
	CategoryOrder Category = "order"
	// CategoryUnknown is a difference no other category explains.
	CategoryUnknown Category = "unknown"
)

const (
	// CategoryDivergentData is a minute the two stores count differently, which the count gate left
	// out of the comparison.
	CategoryDivergentData Category = "divergent_data"
	// CategoryIngestionDuplicate is a minute with the same distinct spans and more rows in one
	// store: explained, and still a divergence.
	CategoryIngestionDuplicate Category = "ingestion_duplicate"
	// CategoryDualWriteUnhealthy is a minute the collector failed to write to a store, left out of
	// the comparison.
	CategoryDualWriteUnhealthy Category = "dual_write_unhealthy"
)

const (
	// CategoryLimit is a trace the engine refuses as too large and ClickHouse answers: accepted,
	// counted.
	CategoryLimit Category = "limit"
	// CategoryPartial is an engine answer that may be partial; the pair runs again next round.
	CategoryPartial Category = "partial"
	// CategoryTimeout is a pair that timed out again after one retry.
	CategoryTimeout Category = "timeout"
	// CategoryAsymmetricFailure is one store failing where the other answered.
	CategoryAsymmetricFailure Category = "asymmetric_failure"
	// CategoryFallbackAttempted is the engine graph reaching for ClickHouse.
	CategoryFallbackAttempted Category = "fallback_attempted"
	// CategoryCoverageGap is a routed query the engine dialect cannot render.
	CategoryCoverageGap Category = "coverage_gap"
)
