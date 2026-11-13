package parity

// derivedColumns are the span columns ClickHouse derives from attributes at ingest and
// fusescope-engine derives when read, from 0.0.5 on.
var derivedColumns = map[string]bool{
	"http_url":             true,
	"http_host":            true,
	"external_http_url":    true,
	"external_http_method": true,
}

// promotedColumns are the engine's promoted span columns, which read NULL when a span has none of
// their keys, by column name and by the attribute keys that feed them (fs-schema's PROMOTED).
var promotedColumns = map[string]bool{
	"service_name": true, "service.name": true,
	"deployment_environment": true, "deployment.environment": true, "deployment.environment.name": true,
	"http_route": true, "http.route": true,
	"http_method": true, "http.request.method": true, "http.method": true,
	"response_status_code": true, "http.response.status_code": true, "http.status_code": true, "rpc.grpc.status_code": true,
	"db_system": true, "db.system": true, "db.system.name": true,
	"db_name": true, "db.namespace": true, "db.name": true,
	"db_operation": true, "db.operation": true, "db.operation.name": true,
	"rpc_system": true, "rpc.system": true,
	"rpc_service": true, "rpc.service": true,
	"rpc_method": true, "rpc.method": true,
	"messaging_system": true, "messaging.system": true,
	"messaging_operation": true, "messaging.operation": true, "messaging.operation.type": true, "messaging.operation.name": true,
	"peer_service": true, "peer.service": true,
}

// Boundary is what the service-boundary evidence found for one operation of a service.
type Boundary int

const (
	// BoundaryDenied is an operation with a root of its own, or no witness of a parent elsewhere.
	BoundaryDenied Boundary = iota
	// BoundaryConfirmed is an operation whose parent was found in another service.
	BoundaryConfirmed
	// BoundaryUnavailable is evidence that could not be read: neither confirmed nor denied.
	BoundaryUnavailable
)

// Context is what classifying a pair's differences needs beyond the differences: what the pair
// tests and how to confirm a known difference.
type Context struct {
	// Service is the service a view of one service was asked for, such as its top operations.
	Service string
	// AbsentKeyCase marks a pair that filters or selects a promoted key absent from some spans.
	AbsentKeyCase bool
	// ServiceBoundary tells whether operation of service has a parent in another service, or that
	// the evidence could not tell.
	ServiceBoundary func(service, operation string) Boundary
	// EvidenceErrors are the errors the evidence met while the pair was classified, for its record.
	EvidenceErrors func() []error
	// OperationOrder judges the order of a top or entry point operations pair, as
	// JudgeOperationOrder does.
	OperationOrder func() Verdict
	// OperationCut judges the operations present on one side only of a pair cut at its limit, as
	// JudgeOperationCut does.
	OperationCut func() Verdict
	// QuantileOf is the quantile a path holds.
	QuantileOf func(Path) (float64, bool)
	// QuantileEvidence is ClickHouse's exact distribution of the path's group for the engine's
	// value; false when it could not be read.
	QuantileEvidence func(path Path, q, v float64) (QuantileEvidence, bool)
}

// Classify gives a difference its category and disposition. Knowing a difference does not accept
// it: the derived columns, the absent key, a contractual order and a boundary ClickHouse alone
// lists are known and blocking. Accepted are a quantile within its rule and an operation or service
// only the engine lists at a confirmed service boundary, which ClickHouse misses when parent and
// child reach it in separate export batches.
func Classify(d Difference, ctx Context) Verdict {
	switch d.Kind {
	case KindQuantile:
		return classifyQuantile(d, ctx)
	case KindOrder:
		if ctx.OperationOrder != nil && len(d.Path) == 1 && d.Path.Last() == "order" {
			return ctx.OperationOrder()
		}
		return Verdict{Category: CategoryOrder, Disposition: Blocking}
	case KindRows:
		// The known causes come first: a cut never hides an absent key or a service boundary.
		if ctx.AbsentKeyCase {
			return Verdict{Category: CategoryAbsentKey, Disposition: Blocking}
		}
		if verdict, ok := classifyBoundary(d, ctx); ok {
			return verdict
		}
		if ctx.OperationCut != nil && len(d.Path) == 2 && d.Path[0] == "items" {
			return ctx.OperationCut()
		}
		return Verdict{Category: CategoryRows, Disposition: Blocking}
	case KindField:
		if derivedColumns[d.Path.Last()] && d.Engine == "" && d.ClickHouse != "" {
			return Verdict{Category: CategoryDerivedColumn, Disposition: Blocking}
		}
		if nullAgainstEmpty(d.Engine, d.ClickHouse) && (ctx.AbsentKeyCase || promotedColumns[d.Path.Last()]) {
			return Verdict{Category: CategoryAbsentKey, Disposition: Blocking}
		}
	}
	return Verdict{Category: CategoryUnknown, Disposition: Blocking}
}

// classifyBoundary judges a row one side alone has at the service boundary, by its direction: the
// engine alone, confirmed, is accepted; ClickHouse alone, confirmed, blocks; evidence that could
// not be read is inconclusive either way. A denied boundary is no verdict here.
func classifyBoundary(d Difference, ctx Context) (Verdict, bool) {
	if ctx.ServiceBoundary == nil {
		return Verdict{}, false
	}
	confirmed := Blocking
	present := d.ClickHouse
	switch {
	case d.ClickHouse == nil && d.Engine != nil:
		confirmed, present = Accepted, d.Engine
	case d.Engine != nil:
		return Verdict{}, false
	}
	switch atServiceBoundary(d, ctx, present) {
	case BoundaryConfirmed:
		return Verdict{Category: CategoryServiceBoundary, Disposition: confirmed}, true
	case BoundaryUnavailable:
		return Verdict{Category: CategoryServiceBoundary, Disposition: Inconclusive}, true
	case BoundaryDenied:
	}
	return Verdict{}, false
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

// atServiceBoundary tells whether what one side alone has, present, is the service-boundary rule: a
// top-level operation or entry point confirmed to have its parent in another service, or a whole
// service every top-level operation of which is. Over a service's operations a denied one decides;
// without one, an unavailable one leaves it unavailable.
func atServiceBoundary(d Difference, ctx Context, present any) Boundary {
	if service, operation, ok := serviceAndOperation(d.Path, ctx); ok {
		return ctx.ServiceBoundary(service, operation)
	}
	service, ok := onlyDynamic(d.Path)
	if !ok {
		return BoundaryDenied
	}
	operations := listedServiceOperations(present)
	if len(operations) == 0 {
		return BoundaryDenied
	}
	found := BoundaryConfirmed
	for _, operation := range operations {
		switch ctx.ServiceBoundary(service, operation) {
		case BoundaryDenied:
			return BoundaryDenied
		case BoundaryUnavailable:
			found = BoundaryUnavailable
		case BoundaryConfirmed:
		}
	}
	return found
}

// listedServiceOperations are the top-level operations of a service as the services view
// normalizes it, past the sentinel.
func listedServiceOperations(occurrences any) []string {
	var operations []string
	list, _ := occurrences.([]any)
	for _, occurrence := range list {
		service, _ := occurrence.(map[string]any)
		warning, _ := service["dataWarning"].(map[string]any)
		ops, _ := warning["topLevelOps"].(map[string]any)
		keyed, _ := ops["operations"].(Keyed)
		for name := range keyed {
			operations = append(operations, name)
		}
	}
	return operations
}

func onlyDynamic(path Path) (string, bool) {
	var found []string
	for _, segment := range path {
		if d, ok := segment.(Dynamic); ok {
			found = append(found, string(d))
		}
	}
	if len(found) != 1 {
		return "", false
	}
	return found[0], true
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
