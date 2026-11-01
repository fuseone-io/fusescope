package implrumapplication

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestModuleNativeErrorEvent(t *testing.T) {
	module, orgID := newTestModule(t)
	id := createTestAndroidApplication(t, module, orgID)
	application, err := module.Get(context.Background(), orgID, id)
	require.NoError(t, err)
	event, err := module.newErrorEvent(context.Background(), application, &resourceInfo{release: "2.2.0"}, &errorEventRow{
		id: "native-exit-1", errorType: "SIGSEGV", message: "Native process terminated by signal 11", source: "native",
		stacktrace: "#00 pc 00000042 /data/app/first/lib/arm64/libcheckout.so (pay+8) (BuildId: abcd)",
	})
	require.NoError(t, err)
	assert.Equal(t, "SIGSEGV", event.Type)
	require.Len(t, event.Frames, 1)
	assert.Contains(t, event.Frames[0].Function, "pc 0x42")
	assert.Nil(t, event.MissingSourceMap, "native frames never request an R8 mapping")
	assert.False(t, event.Symbolicated)
	assert.Empty(t, event.Causes)
}

func TestModuleNativeFingerprints(t *testing.T) {
	module, orgID := newTestModule(t)
	id := createTestAndroidApplication(t, module, orgID)
	groups := map[string]*jvmErrorGroup{}
	first, err := module.jvmFingerprint(context.Background(), id, &errorKeyRow{exceptionType: "SIGABRT", source: "native", release: "1.0", frameLine: "#00 pc 42 /data/app/first/libcheckout.so (BuildId: 1234)"}, groups)
	require.NoError(t, err)
	relocated, err := module.jvmFingerprint(context.Background(), id, &errorKeyRow{exceptionType: "SIGABRT", source: "native", release: "1.1", frameLine: "#00 pc 00000042 /data/app/other/libcheckout.so (BuildId: 1234)"}, groups)
	require.NoError(t, err)
	distinct, err := module.jvmFingerprint(context.Background(), id, &errorKeyRow{exceptionType: "SIGABRT", source: "native", release: "1.1", frameLine: "#00 pc 52 /data/app/other/libcheckout.so (BuildId: 1234)"}, groups)
	require.NoError(t, err)
	assert.Equal(t, first, relocated)
	assert.NotEqual(t, first, distinct)
	require.Len(t, groups, 2)
	require.NotNil(t, groups[first].topFrame)
	assert.Equal(t, "SIGABRT", groups[first].exceptionType)
	assert.False(t, groups[first].retraced)
}
