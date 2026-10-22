package implrumapplication

import (
	"testing"

	"github.com/fuseone-io/fusescope/pkg/types"
	"github.com/fuseone-io/fusescope/pkg/types/rumtypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.opentelemetry.io/collector/pdata/plog"
	"go.opentelemetry.io/collector/pdata/ptrace"
)

func newTestApplication() *rumtypes.Application {
	return &rumtypes.Application{
		Identifiable: types.Identifiable{ID: valuer.GenerateUUID()},
		Name:         "shop-web",
		Platform:     rumtypes.PlatformWeb,
		Environment:  "production",
		PIIPolicy:    rumtypes.PIIPolicy{DropQuery: true, QueryAllowlist: []string{"page"}},
	}
}

func TestProcessTraces(t *testing.T) {
	application := newTestApplication()

	testCases := []struct {
		name      string
		spanName  string
		attrs     map[string]any
		resource  map[string]any
		wantName  string
		wantAttrs map[string]string
		absent    []string
		wantRes   map[string]string
	}{
		{
			name:      "URLAttributesAndName_Scrubbed",
			spanName:  "Navigation: /customers/392#tab?email=a@b.c",
			attrs:     map[string]any{"url.full": "https://shop.example.com/search?q=secret&page=2#x", "http.url": "/a?token=t", "url.query": "email=a&page=3", "url.fragment": "tab", "session.id": "s1"},
			wantName:  "Navigation: /customers/392",
			wantAttrs: map[string]string{"url.full": "https://shop.example.com/search?page=2", "http.url": "/a", "url.query": "page=3", "session.id": "s1"},
			absent:    []string{"url.fragment"},
		},
		{
			name:     "ForgedApplicationResource_Overwritten",
			spanName: "view",
			resource: map[string]any{rumtypes.AttributeApplicationID: "forged", rumtypes.AttributePlatform: "ios", rumtypes.AttributeServiceName: "custom-service"},
			wantName: "view",
			wantRes:  map[string]string{rumtypes.AttributeApplicationID: application.ID.StringValue(), rumtypes.AttributePlatform: "web", rumtypes.AttributeServiceName: "custom-service", rumtypes.AttributeDeploymentEnvironment: "production"},
		},
		{
			name:     "MissingServiceName_Stamped",
			spanName: "documentLoad",
			resource: map[string]any{"location.href": "https://shop.example.com/?ref=mail"},
			wantName: "documentLoad",
			wantRes:  map[string]string{rumtypes.AttributeServiceName: "shop-web", "location.href": "https://shop.example.com/"},
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			traces := ptrace.NewTraces()
			resourceSpans := traces.ResourceSpans().AppendEmpty()
			require.NoError(t, resourceSpans.Resource().Attributes().FromRaw(orEmpty(testCase.resource)))
			span := resourceSpans.ScopeSpans().AppendEmpty().Spans().AppendEmpty()
			span.SetName(testCase.spanName)
			require.NoError(t, span.Attributes().FromRaw(orEmpty(testCase.attrs)))
			event := span.Events().AppendEmpty()
			event.Attributes().PutStr("http.url", "/e?secret=1")

			processTraces(application, traces)

			assert.Equal(t, testCase.wantName, span.Name())
			for key, value := range testCase.wantAttrs {
				got, ok := span.Attributes().Get(key)
				require.True(t, ok, key)
				assert.Equal(t, value, got.Str(), key)
			}
			for _, key := range testCase.absent {
				_, ok := span.Attributes().Get(key)
				assert.False(t, ok, key)
			}
			for key, value := range testCase.wantRes {
				got, ok := resourceSpans.Resource().Attributes().Get(key)
				require.True(t, ok, key)
				assert.Equal(t, value, got.Str(), key)
			}
			eventURL, _ := event.Attributes().Get("http.url")
			assert.Equal(t, "/e", eventURL.Str())
		})
	}
}

func TestProcessTracesBatch(t *testing.T) {
	traces := ptrace.NewTraces()
	resourceSpans := traces.ResourceSpans().AppendEmpty()
	resourceSpans.Resource().Attributes().PutStr(rumtypes.AttributeDistroName, rumtypes.SDKBrowserName)
	resourceSpans.Resource().Attributes().PutStr(rumtypes.AttributeDistroVersion, "0.1.0")
	spans := resourceSpans.ScopeSpans().AppendEmpty().Spans()
	for _, name := range []string{"view", "view", "GET"} {
		span := spans.AppendEmpty()
		span.SetName(name)
		span.Attributes().PutStr(rumtypes.AttributeSessionID, "s-"+name)
	}

	batch := processTraces(newTestApplication(), traces)

	assert.Equal(t, int64(2), batch.Views)
	assert.ElementsMatch(t, []string{"s-view", "s-GET"}, batch.SessionIDs)
	assert.Equal(t, rumtypes.SDKBrowserName, batch.SDKName)
	assert.Equal(t, "0.1.0", batch.SDKVersion)
}

func TestProcessLogs(t *testing.T) {
	testCases := []struct {
		name          string
		eventName     string
		attrs         map[string]any
		wantEventName string
		wantErrors    int64
		wantVitals    int64
	}{
		{name: "EventNameField_CopiedToAttribute", eventName: "exception", attrs: map[string]any{"exception.type": "TypeError", "fusescope.rum.error.source": "onerror"}, wantEventName: "exception", wantErrors: 1},
		{name: "ExistingAttribute_Kept", eventName: "browser.web_vital", attrs: map[string]any{"event.name": "browser.web_vital", "browser.web_vital.name": "lcp"}, wantEventName: "browser.web_vital", wantVitals: 1},
		{name: "AttributeOnly_Counted", attrs: map[string]any{"event.name": "browser.web_vital", "browser.web_vital.name": "inp"}, wantEventName: "browser.web_vital", wantVitals: 1},
		{name: "UserActionClick_NotCounted", eventName: "browser.user_action.click", wantEventName: "browser.user_action.click"},
		{name: "CustomAction_NotCounted", eventName: "fusescope.rum.action", wantEventName: "fusescope.rum.action"},
		{name: "NoEventName_NoAttribute"},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			logs := plog.NewLogs()
			resourceLogs := logs.ResourceLogs().AppendEmpty()
			record := resourceLogs.ScopeLogs().AppendEmpty().LogRecords().AppendEmpty()
			record.SetEventName(testCase.eventName)
			require.NoError(t, record.Attributes().FromRaw(orEmpty(testCase.attrs)))
			record.Attributes().PutStr("page.url", "https://shop.example.com/p?email=x")

			batch := processLogs(newTestApplication(), logs)

			got, ok := record.Attributes().Get(rumtypes.AttributeEventName)
			assert.Equal(t, testCase.wantEventName != "", ok)
			assert.Equal(t, testCase.wantEventName, got.Str())
			assert.Equal(t, testCase.wantErrors, batch.Errors)
			assert.Equal(t, testCase.wantVitals, batch.Vitals)

			pageURL, _ := record.Attributes().Get("page.url")
			assert.Equal(t, "https://shop.example.com/p", pageURL.Str())
			platform, _ := resourceLogs.Resource().Attributes().Get(rumtypes.AttributePlatform)
			assert.Equal(t, "web", platform.Str())
		})
	}
}

func orEmpty(raw map[string]any) map[string]any {
	if raw == nil {
		return map[string]any{}
	}
	return raw
}
