package implrumapplication

import (
	"testing"

	"github.com/fuseone-io/fusescope/pkg/types"
	"github.com/fuseone-io/fusescope/pkg/types/rumtypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.opentelemetry.io/collector/pdata/pcommon"
	"go.opentelemetry.io/collector/pdata/plog"
	"go.opentelemetry.io/collector/pdata/ptrace"
)

func newTestAndroidApplication() *rumtypes.Application {
	return &rumtypes.Application{
		Identifiable:        types.Identifiable{ID: valuer.GenerateUUID()},
		Name:                "shop-android",
		Platform:            rumtypes.PlatformAndroid,
		Environment:         "production",
		AllowedPackageNames: []string{"com.example.shop"},
		PIIPolicy:           rumtypes.PIIPolicy{DropQuery: true},
	}
}

func TestProcessLogsAndroid(t *testing.T) {
	testCases := []struct {
		name        string
		application *rumtypes.Application
		eventName   string
		attrs       map[string]any
		want        map[string]string
		wantErrors  int64
	}{
		{
			name: "UpstreamCrash_Exception", application: newTestAndroidApplication(), eventName: "app.crash",
			attrs:      map[string]any{"exception.type": "java.lang.IllegalStateException", "exception.message": "boom", "exception.stacktrace": "java.lang.IllegalStateException: boom\n\tat a.b.c(SourceFile:1)"},
			want:       map[string]string{rumtypes.AttributeEventName: "exception", rumtypes.AttributeErrorSource: rumtypes.ErrorSourceCrash, "exception.type": "java.lang.IllegalStateException"},
			wantErrors: 1,
		},
		{
			name: "UpstreamANR_ExceptionWithType", application: newTestAndroidApplication(), eventName: "device.anr",
			attrs:      map[string]any{"exception.stacktrace": "java.lang.Thread.sleep(Native Method)\n"},
			want:       map[string]string{rumtypes.AttributeEventName: "exception", rumtypes.AttributeErrorSource: rumtypes.ErrorSourceANR, "exception.type": rumtypes.ExceptionTypeANR, "exception.message": "Application Not Responding"},
			wantErrors: 1,
		},
		{
			name: "DistroANR_Kept", application: newTestAndroidApplication(), eventName: "exception",
			attrs:      map[string]any{"exception.type": rumtypes.ExceptionTypeANR, "exception.message": "main thread blocked for 5s", rumtypes.AttributeErrorSource: rumtypes.ErrorSourceANR},
			want:       map[string]string{rumtypes.AttributeEventName: "exception", rumtypes.AttributeErrorSource: rumtypes.ErrorSourceANR, "exception.message": "main thread blocked for 5s"},
			wantErrors: 1,
		},
		{
			name: "BetaANRType_Normalized", application: newTestAndroidApplication(), eventName: "exception",
			attrs:      map[string]any{"exception.type": "ApplicationNotResponding", rumtypes.AttributeErrorSource: rumtypes.ErrorSourceANR},
			want:       map[string]string{"exception.type": rumtypes.ExceptionTypeANR},
			wantErrors: 1,
		},
		{
			name: "CrashNamedApplicationNotResponding_Kept", application: newTestAndroidApplication(), eventName: "exception",
			attrs:      map[string]any{"exception.type": "ApplicationNotResponding", rumtypes.AttributeErrorSource: rumtypes.ErrorSourceCrash},
			want:       map[string]string{"exception.type": "ApplicationNotResponding"},
			wantErrors: 1,
		},
		{
			name: "ScreenName_Route", application: newTestAndroidApplication(), eventName: "app.screen.click",
			attrs: map[string]any{rumtypes.AttributeScreenName: "CheckoutScreen"},
			want:  map[string]string{rumtypes.AttributeViewRoute: "CheckoutScreen"},
		},
		{
			name: "RouteSet_Kept", application: newTestAndroidApplication(), eventName: "exception",
			attrs:      map[string]any{rumtypes.AttributeScreenName: "CheckoutScreen", rumtypes.AttributeViewRoute: "checkout/{id}"},
			want:       map[string]string{rumtypes.AttributeViewRoute: "checkout/{id}"},
			wantErrors: 1,
		},
		{
			name: "WebCrashName_Untouched", application: newTestApplication(), eventName: "app.crash",
			want: map[string]string{rumtypes.AttributeEventName: "app.crash"},
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			logs := plog.NewLogs()
			record := logs.ResourceLogs().AppendEmpty().ScopeLogs().AppendEmpty().LogRecords().AppendEmpty()
			record.SetEventName(testCase.eventName)
			require.NoError(t, record.Attributes().FromRaw(orEmpty(testCase.attrs)))

			batch := processLogs(testCase.application, logs)

			for key, value := range testCase.want {
				got, ok := record.Attributes().Get(key)
				require.True(t, ok, key)
				assert.Equal(t, value, got.Str(), key)
			}
			assert.Equal(t, testCase.wantErrors, batch.Errors)
		})
	}
}

func TestProcessTracesAndroidScreenRoute(t *testing.T) {
	testCases := []struct {
		name        string
		application *rumtypes.Application
		attrs       map[string]any
		route       string
	}{
		{name: "Android_ScreenNameCopied", application: newTestAndroidApplication(), attrs: map[string]any{rumtypes.AttributeScreenName: "CartScreen"}, route: "CartScreen"},
		{name: "Web_NotCopied", application: newTestApplication(), attrs: map[string]any{rumtypes.AttributeScreenName: "CartScreen"}},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			traces := ptrace.NewTraces()
			span := traces.ResourceSpans().AppendEmpty().ScopeSpans().AppendEmpty().Spans().AppendEmpty()
			span.SetName("Resumed")
			require.NoError(t, span.Attributes().FromRaw(testCase.attrs))

			processTraces(testCase.application, traces)

			route, ok := span.Attributes().Get(rumtypes.AttributeViewRoute)
			assert.Equal(t, testCase.route != "", ok)
			assert.Equal(t, testCase.route, route.Str())
		})
	}
}

func TestAllowedResources(t *testing.T) {
	testCases := []struct {
		name        string
		application *rumtypes.Application
		packages    []any
		packageName string
		allowed     bool
	}{
		{name: "AllowedPackage", application: newTestAndroidApplication(), packages: []any{"com.example.shop"}, allowed: true},
		{name: "OneResourceOtherPackage_Refused", application: newTestAndroidApplication(), packages: []any{"com.example.shop", "com.evil.app"}, packageName: "com.evil.app"},
		{name: "MissingPackage_Refused", application: newTestAndroidApplication(), packages: []any{nil}},
		{name: "Web_NotChecked", application: newTestApplication(), packages: []any{nil}, allowed: true},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			resources := []pcommon.Resource{}
			for _, packageName := range testCase.packages {
				resource := pcommon.NewResource()
				if packageName != nil {
					resource.Attributes().PutStr(rumtypes.AttributePackageName, packageName.(string))
				}
				resources = append(resources, resource)
			}

			packageName, allowed := allowedPackageNames(testCase.application, resources)
			assert.Equal(t, testCase.allowed, allowed)
			assert.Equal(t, testCase.packageName, packageName)
		})
	}
}
