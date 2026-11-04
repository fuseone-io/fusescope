package rumtypes

import "github.com/fuseone-io/fusescope/pkg/valuer"

// TimelineVitalName includes app-start events without adding them to web-vital charts.
type TimelineVitalName struct{ valuer.String }

var TimelineVitalNameAppStart = TimelineVitalName{valuer.NewString("app_start")}

func (TimelineVitalName) Enum() []any {
	return append(VitalName{}.Enum(), TimelineVitalNameAppStart)
}

func NewTimelineVitalName(eventName string, value string) (TimelineVitalName, bool) {
	if eventName == EventNameLegacyVital {
		return TimelineVitalNameAppStart, value == TimelineVitalNameAppStart.StringValue()
	}
	if eventName == EventNameWebVital {
		name, ok := NewVitalName(value)
		return TimelineVitalName(name), ok
	}
	return TimelineVitalName{}, false
}
