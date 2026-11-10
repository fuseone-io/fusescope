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

const (
	// CategoryApproximation is a quantile the two stores estimate differently.
	CategoryApproximation Category = "approximation"
	// CategoryRows is a different set of rows or groups.
	CategoryRows Category = "rows"
)

// Verdict is the category and the disposition of one difference.
type Verdict struct {
	Category    Category
	Disposition Disposition
}
