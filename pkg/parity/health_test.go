package parity

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestAnAttributedFailureInvalidatesItsTenantOnly(t *testing.T) {
	h := Health{Failures: []ExporterFailure{{Instance: "c-0", Tenant: "t1", Minute: at(3), Reason: ReasonSendFailed}}}
	assert.Equal(t, map[int64]FailureReason{at(3): ReasonSendFailed}, h.Unhealthy("t1"))
	assert.Empty(t, h.Unhealthy("t2"))
}

func TestAnUnattributedFailureInvalidatesEveryTenantOfItsInstance(t *testing.T) {
	failure := ExporterFailure{Instance: "c-0", Minute: at(7), Reason: ReasonQueueFull}
	everywhere := Health{Failures: []ExporterFailure{failure}}
	assert.Equal(t, map[int64]FailureReason{at(7): ReasonQueueFull}, everywhere.Unhealthy("t1"))
	assert.Equal(t, map[int64]FailureReason{at(7): ReasonQueueFull}, everywhere.Unhealthy("t2"), "every instance serves every tenant unless told otherwise")

	served := Health{Failures: []ExporterFailure{failure}, Serves: func(instance, tenant string) bool { return tenant == "t1" }}
	assert.NotEmpty(t, served.Unhealthy("t1"))
	assert.Empty(t, served.Unhealthy("t2"), "c-0 does not serve t2")
}

func TestAttributedFailuresIgnoreWhoServes(t *testing.T) {
	h := Health{
		Failures: []ExporterFailure{{Instance: "c-1", Tenant: "t2", Minute: at(1), Reason: ReasonDropped}},
		Serves:   func(string, string) bool { return false },
	}
	assert.Equal(t, map[int64]FailureReason{at(1): ReasonDropped}, h.Unhealthy("t2"))
}

func TestTheReasonOfAMinuteDoesNotDependOnTheFailureOrder(t *testing.T) {
	a := ExporterFailure{Instance: "c-0", Minute: at(2), Reason: ReasonUnobserved}
	b := ExporterFailure{Instance: "c-1", Tenant: "t1", Minute: at(2), Reason: ReasonDropped}
	one := Health{Failures: []ExporterFailure{a, b}}.Unhealthy("t1")
	other := Health{Failures: []ExporterFailure{b, a}}.Unhealthy("t1")
	assert.Equal(t, one, other)
	assert.Len(t, one, 1)
}
