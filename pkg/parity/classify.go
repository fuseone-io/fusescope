package parity

// derivedColumns are the span columns ClickHouse derives from attributes and fusescope-engine does
// not keep yet.
var derivedColumns = map[string]bool{
	"http_url":             true,
	"http_host":            true,
	"external_http_url":    true,
	"external_http_method": true,
}

// Context is what classifying a pair's differences needs beyond the differences: what the pair
// tests and how to confirm a known difference.
type Context struct {
	// Service is the service a view of one service was asked for, such as its top operations.
	Service string
	// AbsentKeyCase marks a pair that filters or selects a promoted key absent from some spans.
	AbsentKeyCase bool
	// ServiceBoundary confirms that operation of service has a parent in another service.
	ServiceBoundary func(service, operation string) bool
	// QuantileOf is the quantile a path holds.
	QuantileOf func(Path) (float64, bool)
	// QuantileEvidence is ClickHouse's exact distribution of the path's group for the engine's
	// value; false when it could not be read.
	QuantileEvidence func(path Path, q, v float64) (QuantileEvidence, bool)
}

// Classify gives a difference its category and disposition. Knowing a difference does not accept
// it: the derived columns, the service boundary, the absent key and a contractual order are known
// and blocking. Only a quantile within its rule is accepted.
func Classify(d Difference, ctx Context) Verdict {
	switch d.Kind {
	case KindQuantile:
		return classifyQuantile(d, ctx)
	case KindOrder:
		return Verdict{Category: CategoryOrder, Disposition: Blocking}
	case KindRows:
		if ctx.AbsentKeyCase {
			return Verdict{Category: CategoryAbsentKey, Disposition: Blocking}
		}
		if service, operation, ok := serviceAndOperation(d.Path, ctx); ok && d.Engine == nil && ctx.ServiceBoundary != nil && ctx.ServiceBoundary(service, operation) {
			return Verdict{Category: CategoryServiceBoundary, Disposition: Blocking}
		}
		return Verdict{Category: CategoryRows, Disposition: Blocking}
	case KindField:
		if derivedColumns[d.Path.Last()] && d.Engine == "" && d.ClickHouse != "" {
			return Verdict{Category: CategoryDerivedColumn, Disposition: Blocking}
		}
		if nullAgainstEmpty(d.Engine, d.ClickHouse) {
			return Verdict{Category: CategoryAbsentKey, Disposition: Blocking}
		}
	}
	return Verdict{Category: CategoryUnknown, Disposition: Blocking}
}

func classifyQuantile(d Difference, ctx Context) Verdict {
	v, isFloat := d.Engine.(float64)
	if !isFloat || ctx.QuantileOf == nil || ctx.QuantileEvidence == nil {
		return Verdict{Category: CategoryUnknown, Disposition: Blocking}
	}
	q, ok := ctx.QuantileOf(d.Path)
	if !ok {
		return Verdict{Category: CategoryUnknown, Disposition: Blocking}
	}
	evidence, ok := ctx.QuantileEvidence(d.Path, q, v)
	if !ok {
		return Verdict{Category: CategoryApproximation, Disposition: Inconclusive}
	}
	return JudgeQuantile(q, v, evidence)
}

// serviceAndOperation reads the service and the operation a top-level or entry point difference is
// about: the first and the last dynamic segments, or the context's service and the only one.
func serviceAndOperation(path Path, ctx Context) (string, string, bool) {
	var dynamic []string
	for _, segment := range path {
		if d, ok := segment.(Dynamic); ok {
			dynamic = append(dynamic, string(d))
		}
	}
	switch {
	case len(dynamic) >= 2:
		return dynamic[0], dynamic[len(dynamic)-1], true
	case len(dynamic) == 1 && ctx.Service != "":
		return ctx.Service, dynamic[0], true
	}
	return "", "", false
}

func nullAgainstEmpty(a, b any) bool {
	return (a == nil && b == "") || (a == "" && b == nil)
}
