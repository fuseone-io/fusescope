package parity

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func waterfallSpan(field string) Path { return p("spans", 0, field) }

func TestADerivedColumnEmptyOnTheEngineIsKnownAndBlocking(t *testing.T) {
	for _, field := range []string{"http_url", "http_host", "external_http_url", "external_http_method"} {
		d := Difference{Path: waterfallSpan(field), Kind: KindField, Engine: "", ClickHouse: "https://cart/items"}
		assert.Equal(t, Verdict{Category: CategoryDerivedColumn, Disposition: Blocking}, Classify(d, Context{}), field)
	}
	d := Difference{Path: waterfallSpan("http_url"), Kind: KindField, Engine: "https://a", ClickHouse: "https://b"}
	assert.Equal(t, Verdict{Category: CategoryUnknown, Disposition: Blocking}, Classify(d, Context{}), "a different value, not an empty one, is not the known gap")
}

func TestNullAgainstTheEmptyStringOfAPromotedColumnIsKnownAndBlocking(t *testing.T) {
	d := Difference{Path: waterfallSpan("http_route"), Kind: KindField, Engine: nil, ClickHouse: ""}
	assert.Equal(t, Verdict{Category: CategoryAbsentKey, Disposition: Blocking}, Classify(d, Context{}))
}

func TestARowDifferenceInAnAbsentKeyCaseIsKnownAndBlocking(t *testing.T) {
	d := Difference{Path: p("results", 0, "rows"), Kind: KindRows}
	assert.Equal(t, Verdict{Category: CategoryAbsentKey, Disposition: Blocking}, Classify(d, Context{AbsentKeyCase: true}))
	assert.Equal(t, Verdict{Category: CategoryRows, Disposition: Blocking}, Classify(d, Context{}), "elsewhere a row difference is just that")
}

func TestAnExtraTopLevelOperationAtAServiceBoundaryIsKnownAndBlocking(t *testing.T) {
	boundary := func(service, operation string) bool { return service == "eng-x-back" && operation == "x.handle" }
	d := Difference{Path: p("services", Dynamic("eng-x-back"), "topLevelOps", Dynamic("x.handle")), Kind: KindRows, ClickHouse: float64(1)}
	assert.Equal(t, Verdict{Category: CategoryServiceBoundary, Disposition: Blocking}, Classify(d, Context{ServiceBoundary: boundary}))

	other := Difference{Path: p("services", Dynamic("eng-x-back"), "topLevelOps", Dynamic("other")), Kind: KindRows, ClickHouse: float64(1)}
	assert.Equal(t, Verdict{Category: CategoryRows, Disposition: Blocking}, Classify(other, Context{ServiceBoundary: boundary}), "only a confirmed boundary is the known difference")
}

func TestAnOrderDifferenceBlocks(t *testing.T) {
	d := Difference{Path: p("top_operations"), Kind: KindOrder}
	assert.Equal(t, Verdict{Category: CategoryOrder, Disposition: Blocking}, Classify(d, Context{}))
}

func TestAQuantileIsJudgedOnItsEvidence(t *testing.T) {
	values := []float64{200, 200, 200, 400, 400, 800}
	ctx := Context{QuantileEvidence: func(path Path, q, v float64) (QuantileEvidence, bool) {
		return evidence(values, q, v), path.Last() == "p99"
	}, QuantileOf: func(path Path) (float64, bool) { return 0.99, path.Last() == "p99" }}

	within := Difference{Path: p("services", Dynamic("eng-cart"), "p99"), Kind: KindQuantile, Engine: float64(780), ClickHouse: float64(664)}
	assert.Equal(t, Verdict{Category: CategoryApproximation, Disposition: Accepted}, Classify(within, ctx))

	outside := Difference{Path: p("services", Dynamic("eng-cart"), "p99"), Kind: KindQuantile, Engine: float64(900), ClickHouse: float64(664)}
	assert.Equal(t, Verdict{Category: CategoryApproximation, Disposition: Blocking}, Classify(outside, ctx))
}

func TestAQuantileWithoutEvidenceIsInconclusive(t *testing.T) {
	ctx := Context{QuantileOf: func(Path) (float64, bool) { return 0.99, true }, QuantileEvidence: func(Path, float64, float64) (QuantileEvidence, bool) { return QuantileEvidence{}, false }}
	d := Difference{Path: p("p99"), Kind: KindQuantile, Engine: float64(1), ClickHouse: float64(2)}
	assert.Equal(t, Verdict{Category: CategoryApproximation, Disposition: Inconclusive}, Classify(d, ctx), "the verification query failed: undecided, not accepted")
}

func TestAnythingElseIsUnknownAndBlocking(t *testing.T) {
	d := Difference{Path: p("summary", "rootServiceName"), Kind: KindField, Engine: "a", ClickHouse: "b"}
	assert.Equal(t, Verdict{Category: CategoryUnknown, Disposition: Blocking}, Classify(d, Context{}))
}

func TestNullAgainstTheEmptyStringOutsideAPromotedColumnIsUnknown(t *testing.T) {
	d := Difference{Path: p("data", "rootServiceName"), Kind: KindField, Engine: nil, ClickHouse: ""}
	assert.Equal(t, Verdict{Category: CategoryUnknown, Disposition: Blocking}, Classify(d, Context{}), "a nullable field that is not promoted")
	assert.Equal(t, Verdict{Category: CategoryAbsentKey, Disposition: Blocking}, Classify(d, Context{AbsentKeyCase: true}), "unless the pair tests an absent key")
	for _, field := range []string{"http_route", "db_name", "service.name", "http.route", "db.namespace"} {
		promoted := Difference{Path: p("data", "results", 0, "rows", 0, "data", field), Kind: KindField, Engine: nil, ClickHouse: ""}
		assert.Equal(t, Verdict{Category: CategoryAbsentKey, Disposition: Blocking}, Classify(promoted, Context{}), field)
	}
}
