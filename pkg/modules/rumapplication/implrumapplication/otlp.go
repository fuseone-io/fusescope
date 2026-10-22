package implrumapplication

import (
	"github.com/fuseone-io/fusescope/pkg/types/rumtypes"
	"go.opentelemetry.io/collector/pdata/pcommon"
	"go.opentelemetry.io/collector/pdata/plog"
	"go.opentelemetry.io/collector/pdata/ptrace"
)

// processTraces scrubs and stamps the request in place and reports what it saw.
func processTraces(application *rumtypes.Application, traces ptrace.Traces) *rumtypes.IngestBatch {
	batch := &rumtypes.IngestBatch{}
	sessions := map[string]struct{}{}

	for i := 0; i < traces.ResourceSpans().Len(); i++ {
		resourceSpans := traces.ResourceSpans().At(i)
		stampResource(application, resourceSpans.Resource(), batch)

		for j := 0; j < resourceSpans.ScopeSpans().Len(); j++ {
			spans := resourceSpans.ScopeSpans().At(j).Spans()
			for k := 0; k < spans.Len(); k++ {
				span := spans.At(k)
				span.SetName(application.PIIPolicy.ScrubSpanName(span.Name()))
				scrubAttributes(application.PIIPolicy, span.Attributes())
				for l := 0; l < span.Events().Len(); l++ {
					scrubAttributes(application.PIIPolicy, span.Events().At(l).Attributes())
				}
				for l := 0; l < span.Links().Len(); l++ {
					scrubAttributes(application.PIIPolicy, span.Links().At(l).Attributes())
				}

				collectSession(span.Attributes(), sessions)
				if span.Name() == rumtypes.SpanNameView {
					batch.Views++
				}
			}
		}
	}

	batch.SessionIDs = sessionList(sessions)
	return batch
}

// processLogs also copies each record's event name into the event.name
// attribute, which is all the logs table keeps of it.
func processLogs(application *rumtypes.Application, logs plog.Logs) *rumtypes.IngestBatch {
	batch := &rumtypes.IngestBatch{}
	sessions := map[string]struct{}{}

	for i := 0; i < logs.ResourceLogs().Len(); i++ {
		resourceLogs := logs.ResourceLogs().At(i)
		stampResource(application, resourceLogs.Resource(), batch)

		for j := 0; j < resourceLogs.ScopeLogs().Len(); j++ {
			records := resourceLogs.ScopeLogs().At(j).LogRecords()
			for k := 0; k < records.Len(); k++ {
				attributes := records.At(k).Attributes()
				scrubAttributes(application.PIIPolicy, attributes)

				if eventName := records.At(k).EventName(); eventName != "" {
					if _, ok := attributes.Get(rumtypes.AttributeEventName); !ok {
						attributes.PutStr(rumtypes.AttributeEventName, eventName)
					}
				}

				collectSession(attributes, sessions)
				if eventName, ok := attributes.Get(rumtypes.AttributeEventName); ok {
					switch eventName.Str() {
					case rumtypes.EventNameException:
						batch.Errors++
					case rumtypes.EventNameWebVital, rumtypes.EventNameLegacyVital:
						batch.Vitals++
					}
				}
			}
		}
	}

	batch.SessionIDs = sessionList(sessions)
	return batch
}

// stampResource overwrites the application and platform a client may have
// forged, and fills service and environment only when missing.
func stampResource(application *rumtypes.Application, resource pcommon.Resource, batch *rumtypes.IngestBatch) {
	attributes := resource.Attributes()
	scrubAttributes(application.PIIPolicy, attributes)

	attributes.PutStr(rumtypes.AttributeApplicationID, application.ID.StringValue())
	attributes.PutStr(rumtypes.AttributePlatform, application.Platform.StringValue())
	if _, ok := attributes.Get(rumtypes.AttributeServiceName); !ok {
		attributes.PutStr(rumtypes.AttributeServiceName, application.Name)
	}
	if _, ok := attributes.Get(rumtypes.AttributeDeploymentEnvironment); !ok {
		attributes.PutStr(rumtypes.AttributeDeploymentEnvironment, application.Environment)
	}

	for _, keys := range [][2]string{{rumtypes.AttributeDistroName, rumtypes.AttributeDistroVersion}, {rumtypes.AttributeSDKName, rumtypes.AttributeSDKVersion}} {
		if name, ok := attributes.Get(keys[0]); ok && name.Str() != "" {
			version, _ := attributes.Get(keys[1])
			batch.SDKName, batch.SDKVersion = name.Str(), version.AsString()
			return
		}
	}
}

func scrubAttributes(policy rumtypes.PIIPolicy, attributes pcommon.Map) {
	for _, key := range rumtypes.URLAttributes {
		if value, ok := attributes.Get(key); ok && value.Type() == pcommon.ValueTypeStr {
			value.SetStr(policy.ScrubURL(value.Str()))
		}
	}

	if value, ok := attributes.Get(rumtypes.QueryAttribute); ok && value.Type() == pcommon.ValueTypeStr {
		if query := policy.ScrubQuery(value.Str()); query != "" {
			value.SetStr(query)
		} else {
			attributes.Remove(rumtypes.QueryAttribute)
		}
	}

	attributes.Remove(rumtypes.FragmentAttribute)
}

func collectSession(attributes pcommon.Map, sessions map[string]struct{}) {
	if sessionID, ok := attributes.Get(rumtypes.AttributeSessionID); ok && sessionID.Str() != "" {
		sessions[sessionID.Str()] = struct{}{}
	}
}

func sessionList(sessions map[string]struct{}) []string {
	list := make([]string, 0, len(sessions))
	for sessionID := range sessions {
		list = append(list, sessionID)
	}
	return list
}
