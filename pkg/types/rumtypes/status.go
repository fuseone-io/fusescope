package rumtypes

import (
	"time"

	"github.com/fuseone-io/fusescope/pkg/valuer"
)

// StatusWindow is the period the setup status counts over.
const StatusWindow = 5 * time.Minute

var (
	RejectionReasonBadKey           = RejectionReason{valuer.NewString("bad_key")}
	RejectionReasonUnknownKey       = RejectionReason{valuer.NewString("unknown_key")}
	RejectionReasonOriginNotAllowed = RejectionReason{valuer.NewString("origin_not_allowed")}
	RejectionReasonRateLimited      = RejectionReason{valuer.NewString("rate_limited")}
	RejectionReasonTooLarge         = RejectionReason{valuer.NewString("too_large")}
	RejectionReasonInvalidPayload   = RejectionReason{valuer.NewString("invalid_payload")}
)

type RejectionReason struct{ valuer.String }

// GettableApplicationStatus backs the setup screen. Counts, the SDK seen and
// rejections are kept in memory by each server instance over StatusWindow, so
// they reset on restart and cover only the instance that answers.
type GettableApplicationStatus struct {
	FirstSeenAt   *time.Time         `json:"firstSeenAt" required:"true" nullable:"true"`
	WindowSeconds int64              `json:"windowSeconds" required:"true"`
	Counts        IngestCounts       `json:"counts" required:"true"`
	SDK           SeenSDK            `json:"sdk" required:"true"`
	SupportedSDKs []SupportedSDK     `json:"supportedSdks" required:"true"`
	Rejections    []*IngestRejection `json:"rejections" required:"true"`
}

type IngestCounts struct {
	Sessions int64 `json:"sessions" required:"true" description:"Distinct session.id values."`
	Views    int64 `json:"views" required:"true" description:"Spans named view."`
	Errors   int64 `json:"errors" required:"true" description:"Log records with event.name exception."`
	Vitals   int64 `json:"vitals" required:"true" description:"Log records with event.name browser.web_vital or rum.vital."`
}

type SeenSDK struct {
	Name    string     `json:"name" required:"true" description:"telemetry.distro.name, else telemetry.sdk.name, of the last batch."`
	Version string     `json:"version" required:"true"`
	Support SDKSupport `json:"support" required:"true"`
}

// IngestRejection groups refused requests by reason. A key the server has
// never issued is counted as unknown_key by every application that allows the
// request's origin, and not at all when none does.
type IngestRejection struct {
	Reason     RejectionReason `json:"reason" required:"true"`
	Count      int64           `json:"count" required:"true"`
	LastOrigin string          `json:"lastOrigin" required:"true" description:"Origin header of the last refused request, empty when absent."`
	LastSeenAt time.Time       `json:"lastSeenAt" required:"true"`
}

// IngestBatch is what the gateway learned from one accepted request.
type IngestBatch struct {
	SessionIDs []string
	Views      int64
	Errors     int64
	Vitals     int64
	SDKName    string
	SDKVersion string
}

func (RejectionReason) Enum() []any {
	return []any{RejectionReasonBadKey, RejectionReasonUnknownKey, RejectionReasonOriginNotAllowed, RejectionReasonRateLimited, RejectionReasonTooLarge, RejectionReasonInvalidPayload}
}
