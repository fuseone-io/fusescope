package rumtypes

import (
	"strings"
	"time"

	"github.com/fuseone-io/fusescope/pkg/valuer"
)

var (
	VitalNameLCP  = VitalName{valuer.NewString("lcp")}
	VitalNameINP  = VitalName{valuer.NewString("inp")}
	VitalNameCLS  = VitalName{valuer.NewString("cls")}
	VitalNameFCP  = VitalName{valuer.NewString("fcp")}
	VitalNameTTFB = VitalName{valuer.NewString("ttfb")}
)

var (
	VitalRatingGood             = VitalRating{valuer.NewString("good")}
	VitalRatingNeedsImprovement = VitalRating{valuer.NewString("needs-improvement")}
	VitalRatingPoor             = VitalRating{valuer.NewString("poor")}
)

// VitalName is browser.web_vital.name, lowercase as web-vitals reports it.
type VitalName struct{ valuer.String }

type VitalRating struct{ valuer.String }

type GettableViews struct {
	Routes   []*ViewRoute `json:"routes" required:"true"`
	Sessions int64        `json:"sessions" required:"true" description:"Sessions with spans or logs in the range, for shares of sessions; approximate above 65,536."`
}

type ViewCounts struct {
	Views        int64 `json:"views" required:"true"`
	PageLoads    int64 `json:"pageLoads" required:"true" description:"Views with loading type initial_load."`
	RouteChanges int64 `json:"routeChanges" required:"true" description:"Views with loading type route_change."`
	UnknownLoads int64 `json:"unknownLoads" required:"true" description:"Views without a loading type, from SDKs before 0.2.0."`
}

type ViewRoute struct {
	Route string `json:"route" required:"true"`
	ViewCounts
	MedianTimeOnViewMs float64                 `json:"medianTimeOnViewMs" required:"true"`
	Errors             int64                   `json:"errors" required:"true"`
	LCP                *VitalSummary           `json:"lcp" required:"true" nullable:"true"`
	INP                *VitalSummary           `json:"inp" required:"true" nullable:"true"`
	CLS                *VitalSummary           `json:"cls" required:"true" nullable:"true"`
	SlowestRequest     *RequestTemplateLatency `json:"slowestRequest" required:"true" nullable:"true" description:"The request template with the highest p75 on the route."`
}

// VitalSummary counts samples by the rating the SDK assigned.
type VitalSummary struct {
	Name             VitalName `json:"name" required:"true"`
	Samples          int64     `json:"samples" required:"true"`
	P75              float64   `json:"p75" required:"true" description:"Milliseconds; unitless for cls."`
	Good             int64     `json:"good" required:"true"`
	NeedsImprovement int64     `json:"needsImprovement" required:"true"`
	Poor             int64     `json:"poor" required:"true"`
}

type RequestTemplateLatency struct {
	RequestTemplate
	P75Ms float64 `json:"p75Ms" required:"true"`
	Calls int64   `json:"calls" required:"true"`
}

type GettableView struct {
	Route string `json:"route" required:"true"`
	ViewCounts
	MedianTimeOnViewMs float64                 `json:"medianTimeOnViewMs" required:"true"`
	Errors             int64                   `json:"errors" required:"true"`
	ExamplePaths       []string                `json:"examplePaths" required:"true" description:"Up to three url.path values seen on the route."`
	Vitals             []*VitalSummary         `json:"vitals" required:"true" description:"Every vital with samples, in lcp, inp, cls, fcp, ttfb order."`
	Series             *VitalSeries            `json:"series" required:"true"`
	Releases           []*ReleaseMarker        `json:"releases" required:"true" description:"service.version values seen on the route, by first view."`
	SlowRequests       []*RequestTemplateStats `json:"slowRequests" required:"true" description:"Up to 10 request templates by p75."`
	Browsers           []*ClientBreakdown      `json:"browsers" required:"true"`
	OperatingSystems   []*ClientBreakdown      `json:"operatingSystems" required:"true"`
	RecentSessions     []*RouteSession         `json:"recentSessions" required:"true" description:"The 10 sessions that entered the route last."`
}

type VitalSeries struct {
	StepSeconds int64              `json:"stepSeconds" required:"true"`
	Vitals      []*VitalSeriesLine `json:"vitals" required:"true"`
}

type VitalSeriesLine struct {
	Name   VitalName           `json:"name" required:"true"`
	Points []*VitalSeriesPoint `json:"points" required:"true" description:"Buckets with samples only."`
}

type VitalSeriesPoint struct {
	Timestamp time.Time `json:"timestamp" required:"true" description:"Bucket start."`
	P75       float64   `json:"p75" required:"true"`
	Samples   int64     `json:"samples" required:"true"`
}

type ReleaseMarker struct {
	Release     string    `json:"release" required:"true"`
	FirstSeenAt time.Time `json:"firstSeenAt" required:"true"`
}

type RequestTemplateStats struct {
	RequestTemplate
	P75Ms          float64 `json:"p75Ms" required:"true"`
	Calls          int64   `json:"calls" required:"true"`
	Failed         int64   `json:"failed" required:"true"`
	ExampleTraceID string  `json:"exampleTraceId" required:"true" description:"Trace of the slowest call."`
	BackendService string  `json:"backendService" required:"true" description:"service.name of the first backend span in the example trace, empty without one."`
}

type ClientBreakdown struct {
	Name      string   `json:"name" required:"true" description:"Browser or OS with its major version, e.g. Chrome 130; Unknown when not parsed."`
	Views     int64    `json:"views" required:"true"`
	PageLoads int64    `json:"pageLoads" required:"true"`
	LCPP75Ms  *float64 `json:"lcpP75Ms" required:"true" nullable:"true"`
}

type RouteSession struct {
	SessionID   string      `json:"sessionId" required:"true"`
	StartedAt   time.Time   `json:"startedAt" required:"true" description:"Start of the session's first view on the route."`
	LoadingType LoadingType `json:"loadingType" required:"true"`
	LCPMs       *float64    `json:"lcpMs" required:"true" nullable:"true" description:"LCP of a page load on the route."`
	Errors      int64       `json:"errors" required:"true" description:"Errors on the route."`
	Client      Client      `json:"client" required:"true"`
}

func (VitalName) Enum() []any {
	return []any{VitalNameLCP, VitalNameINP, VitalNameCLS, VitalNameFCP, VitalNameTTFB}
}

func VitalNames() []VitalName {
	return []VitalName{VitalNameLCP, VitalNameINP, VitalNameCLS, VitalNameFCP, VitalNameTTFB}
}

func NewVitalName(value string) (VitalName, bool) {
	for _, name := range VitalNames() {
		if name.StringValue() == valuer.NewString(value).StringValue() {
			return name, true
		}
	}
	return VitalName{}, false
}

func (VitalRating) Enum() []any {
	return []any{VitalRatingGood, VitalRatingNeedsImprovement, VitalRatingPoor}
}

// BrowserLabel names the browser, or the device of a mobile client.
func (client Client) BrowserLabel() string {
	if client.Browser == "" && client.Device != "" {
		return client.Device
	}
	return label(client.Browser, client.BrowserVersion)
}

// MatchesBrowser reports whether the browser name, or the device of a
// mobile client, is name, ignoring case.
func (client Client) MatchesBrowser(name string) bool {
	return (client.Browser != "" && strings.EqualFold(client.Browser, name)) || (client.Device != "" && strings.EqualFold(client.Device, name))
}

func (client Client) OSLabel() string {
	return label(client.OS, client.OSVersion)
}

func label(name string, version string) string {
	if name == "" {
		return "Unknown"
	}
	if version == "" {
		return name
	}
	return name + " " + version
}
