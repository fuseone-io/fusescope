package parity

// FailureReason is how the collector failed to write spans to one of the two stores.
type FailureReason string

const (
	ReasonSendFailed FailureReason = "send_failed"
	ReasonDropped    FailureReason = "dropped"
	ReasonQueueFull  FailureReason = "queue_full"
	// ReasonUnobserved is a minute an instance's metrics were not read, which proves nothing healthy.
	ReasonUnobserved FailureReason = "unobserved"
)

// ExporterFailure is a minute in which a collector instance failed to write to either store. Tenant
// is empty when the metric does not say whose spans failed.
type ExporterFailure struct {
	Instance string
	Tenant   string
	Minute   int64
	Reason   FailureReason
}

// Health is the dual-write health of a round's window. Serves says whether a collector instance
// writes a tenant's spans; nil means every instance serves every tenant.
type Health struct {
	Failures []ExporterFailure
	Serves   func(instance, tenant string) bool
}

// Unhealthy is the minutes in which tenant's spans may be in one store and not the other: a
// failure attributed to tenant, or an unattributed failure on an instance that serves it. A minute
// with several failures keeps the least reason, so the answer does not depend on their order.
func (h Health) Unhealthy(tenant string) map[int64]FailureReason {
	out := map[int64]FailureReason{}
	for _, f := range h.Failures {
		hit := f.Tenant == tenant
		if f.Tenant == "" {
			hit = h.Serves == nil || h.Serves(f.Instance, tenant)
		}
		if !hit {
			continue
		}
		if prev, ok := out[f.Minute]; !ok || f.Reason < prev {
			out[f.Minute] = f.Reason
		}
	}
	return out
}
