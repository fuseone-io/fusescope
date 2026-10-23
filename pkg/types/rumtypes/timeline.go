package rumtypes

import (
	"slices"
	"time"

	"github.com/fuseone-io/fusescope/pkg/valuer"
)

const (
	AttributeURLPath           = "url.path"
	AttributeViewLoadingType   = "fusescope.rum.view.loading_type"
	AttributeSessionPreviousID = "session.previous_id"
	AttributeUserID            = "user.id"
	AttributeUserHash          = "user.hash"
	AttributeExceptionType     = "exception.type"
	AttributeExceptionMessage  = "exception.message"
	AttributeExceptionStack    = "exception.stacktrace"
	AttributeErrorSource       = "fusescope.rum.error.source"
	AttributeVitalName         = "browser.web_vital.name"
	AttributeVitalValue        = "browser.web_vital.value"
	AttributeVitalRating       = "browser.web_vital.rating"
	AttributeActionType        = "fusescope.rum.action.type"
	AttributeActionName        = "fusescope.rum.action.name"
	AttributeActionTarget      = "fusescope.rum.action.target"
	AttributeCSSSelector       = "browser.css_selector"
	AttributeServiceVersion    = "service.version"
	AttributeUserAgent         = "user_agent.original"
	AttributeBrowserBrands     = "browser.brands"
	AttributeBrowserPlatform   = "browser.platform"
)

const (
	EventNameClick        = "browser.user_action.click"
	EventNameCustomAction = "fusescope.rum.action"
)

// LinkedRequestWindow is how long before an error a failed request is taken as its cause.
const (
	LinkedRequestWindow = 5 * time.Second
	BreadcrumbWindow    = 2 * time.Minute
)

var (
	LoadingTypeInitialLoad = LoadingType{valuer.NewString("initial_load")}
	LoadingTypeRouteChange = LoadingType{valuer.NewString("route_change")}
	LoadingTypeUnknown     = LoadingType{valuer.NewString("unknown")}
)

var (
	TimelineEventKindView    = TimelineEventKind{valuer.NewString("view")}
	TimelineEventKindRequest = TimelineEventKind{valuer.NewString("request")}
	TimelineEventKindClick   = TimelineEventKind{valuer.NewString("click")}
	TimelineEventKindAction  = TimelineEventKind{valuer.NewString("action")}
	TimelineEventKindError   = TimelineEventKind{valuer.NewString("error")}
	TimelineEventKindVital   = TimelineEventKind{valuer.NewString("vital")}
)

// LoadingType tells a full page load from an SPA route change. Views from
// SDKs before 0.2.0 carry none and are unknown.
type LoadingType struct{ valuer.String }

type TimelineEventKind struct{ valuer.String }

// TimelineEvent is one thing that happened in a session. Exactly one of the
// payloads is set, matching kind.
type TimelineEvent struct {
	Kind      TimelineEventKind `json:"kind" required:"true"`
	Timestamp time.Time         `json:"timestamp" required:"true"`
	Route     string            `json:"route" required:"true" description:"fusescope.rum.view.route when the event happened."`
	View      *ViewEvent        `json:"view,omitempty"`
	Request   *RequestEvent     `json:"request,omitempty"`
	Action    *ActionEvent      `json:"action,omitempty" description:"Set for click and action events."`
	Error     *ErrorEventInfo   `json:"error,omitempty"`
	Vital     *VitalEvent       `json:"vital,omitempty"`
}

type ViewEvent struct {
	SpanID      string      `json:"spanId" required:"true"`
	Path        string      `json:"path" required:"true" description:"url.path."`
	LoadingType LoadingType `json:"loadingType" required:"true"`
	DurationMs  float64     `json:"durationMs" required:"true" description:"Time on view: the view span's duration."`
}

type RequestEvent struct {
	RequestTemplate
	SpanID         string  `json:"spanId" required:"true"`
	TraceID        string  `json:"traceId" required:"true"`
	URL            string  `json:"url" required:"true" description:"url.full, already scrubbed by the gateway."`
	StatusCode     int     `json:"statusCode" required:"true" description:"0 when the request got no response."`
	DurationMs     float64 `json:"durationMs" required:"true"`
	Failed         bool    `json:"failed" required:"true" description:"Status 400 or more, or an error span."`
	HasBackend     bool    `json:"hasBackend" required:"true" description:"Spans from another service share the trace."`
	BackendService string  `json:"backendService" required:"true" description:"service.name of the first backend span, empty without one."`
}

type ActionEvent struct {
	Type   string `json:"type" required:"true" description:"fusescope.rum.action.type, e.g. click or custom."`
	Name   string `json:"name" required:"true" description:"fusescope.rum.action.name of a custom action."`
	Target string `json:"target" required:"true" description:"fusescope.rum.action.target, else browser.css_selector."`
}

type ErrorEventInfo struct {
	Fingerprint string `json:"fingerprint" required:"true"`
	Type        string `json:"type" required:"true"`
	Message     string `json:"message" required:"true"`
	Source      string `json:"source" required:"true" description:"fusescope.rum.error.source, e.g. onerror or unhandledrejection."`
}

type VitalEvent struct {
	Name   VitalName   `json:"name" required:"true"`
	Value  float64     `json:"value" required:"true" description:"Milliseconds; unitless for cls."`
	Rating VitalRating `json:"rating" required:"true"`
}

func (LoadingType) Enum() []any {
	return []any{LoadingTypeInitialLoad, LoadingTypeRouteChange, LoadingTypeUnknown}
}

func NewLoadingType(value string) LoadingType {
	switch value {
	case LoadingTypeInitialLoad.StringValue():
		return LoadingTypeInitialLoad
	case LoadingTypeRouteChange.StringValue():
		return LoadingTypeRouteChange
	}
	return LoadingTypeUnknown
}

func (TimelineEventKind) Enum() []any {
	return []any{TimelineEventKindView, TimelineEventKindRequest, TimelineEventKindClick, TimelineEventKindAction, TimelineEventKindError, TimelineEventKindVital}
}

// NearestFailedRequest returns the failed request that started last in the
// window before at, or nil.
func NearestFailedRequest(events []*TimelineEvent, at time.Time) *TimelineEvent {
	var nearest *TimelineEvent
	for _, event := range events {
		if event.Request == nil || !event.Request.Failed || event.Timestamp.After(at) || at.Sub(event.Timestamp) > LinkedRequestWindow {
			continue
		}
		if nearest == nil || event.Timestamp.After(nearest.Timestamp) {
			nearest = event
		}
	}
	return nearest
}

func sortTimeline(events []*TimelineEvent) {
	slices.SortStableFunc(events, func(a, b *TimelineEvent) int {
		return a.Timestamp.Compare(b.Timestamp)
	})
}
