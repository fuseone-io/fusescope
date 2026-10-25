package implrumapplication

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	cmock "github.com/SigNoz/clickhouse-go-mock"
	"github.com/fuseone-io/fusescope/pkg/types/rumtypes"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const (
	androidKeyFrames      = "\tat a.b.a(SourceFile:6)\n\tat a.b.b(SourceFile:2)\n\tat com.example.shop.CheckoutActivity.onCreate(SourceFile:3)\n\tat android.app.Activity.performCreate(Activity.java:8595)"
	androidUnmappedFrames = "\tat com.example.shop.Item.price(Item.kt:15)\n\tat com.example.shop.Cart.subtotal(Cart.kt:44)\n\tat com.example.shop.Cart.checkout(Cart.kt:51)"
)

var (
	androidKeyColumns   = []cmock.ColumnType{{Name: "key", Type: "UInt64"}, {Name: "type", Type: "String"}, {Name: "normalized_message", Type: "String"}, {Name: "frame_line", Type: "String"}, {Name: "first_seen", Type: "UInt64"}, {Name: "first_fingerprint", Type: "String"}, {Name: "release", Type: "String"}}
	androidResourceCols = []cmock.ColumnType{{Name: "fingerprint", Type: "String"}, {Name: "release", Type: "String"}, {Name: "environment", Type: "String"}, {Name: "ua", Type: "String"}, {Name: "brands", Type: "String"}, {Name: "platform", Type: "String"}, {Name: "client_key", Type: "UInt64"}, {Name: "first_seen", Type: "Int64"}}
	androidGroupColumns = []cmock.ColumnType{{Name: "group_index", Type: "UInt16"}, {Name: "events", Type: "UInt64"}, {Name: "sessions", Type: "UInt64"}, {Name: "first", Type: "UInt64"}, {Name: "last", Type: "UInt64"}, {Name: "message", Type: "String"}, {Name: "route", Type: "String"}, {Name: "source", Type: "String"}, {Name: "frame_line", Type: "String"}, {Name: "last_release", Type: "String"}, {Name: "releases", Type: "Array(String)"}, {Name: "sparkline", Type: "Map(UInt64, UInt64)"}}
)

func expectAndroidErrorKeys(mock cmock.ClickConnMockCommon) {
	mock.ExpectQuery(`SELECT cityHash64\(type, normalized_message, frame_line, release\) AS key, .* resources_string\['service.version'\] AS release`).WithArgs(anyArgs(10)...).WillReturnRows(cmock.NewRows(androidKeyColumns, [][]any{
		{uint64(21), "a.a", "Cart is empty", androidKeyFrames, uint64(2_000_000_000), "fp-mapped", "2.1.0"},
		{uint64(22), "com.example.shop.CartException", "Cart <n> is empty", androidUnmappedFrames, uint64(1_000_000_000), "fp-debug", "2.1.0-debug"},
		{uint64(23), rumtypes.ExceptionTypeANR, "Application Not Responding", "java.lang.Thread.sleep(Native Method)\ncom.example.shop.CheckoutActivity.onPay(CheckoutActivity.kt:40)", uint64(3_000_000_000), "fp-mapped", "2.1.0"},
	}))
	mock.ExpectQuery(`FROM .signoz_logs.\..distributed_logs_v2_resource. WHERE .* GROUP BY fingerprint LIMIT \?`).WithArgs(anyArgs(5)...).WillReturnRows(cmock.NewRows(androidResourceCols, [][]any{
		{"fp-mapped", "2.1.0", "production", "", "", "", uint64(1), int64(1500)}, {"fp-debug", "2.1.0-debug", "production", "", "", "", uint64(2), int64(500)},
	}))
}

func TestHandlerListErrorGroupsAndroidGroupsRetracedFrames(t *testing.T) {
	module, orgID, mock := newTestModuleWithMock(t, true)
	id := createTestAndroidApplication(t, module, orgID)
	_, err := module.UploadR8Mapping(context.Background(), orgID, id, "2.1.0", "ci@example.com", strings.NewReader(readR8Fixture(t, "mapping.txt")))
	require.NoError(t, err)

	expectAndroidErrorKeys(mock)
	mock.ExpectQuery(`transform\(cityHash64\(type, normalized_message, frame_line, release\), \?, \?, toUInt16\(0\)\) AS group_index`).WithArgs(anyArgs(15)...).WillReturnRows(cmock.NewRows(androidGroupColumns, [][]any{
		{uint16(1), uint64(7), uint64(4), uint64(1_000_000_000), uint64(9_000_000_000), "Cart is empty", "CheckoutScreen", rumtypes.ErrorSourceCrash, androidKeyFrames, "2.1.0", []string{"2.1.0", "2.1.0-debug"}, map[uint64]uint64{}},
		{uint16(2), uint64(2), uint64(2), uint64(3_000_000_000), uint64(3_000_000_000), "Application Not Responding", "CheckoutScreen", rumtypes.ErrorSourceANR, "java.lang.Thread.sleep(Native Method)", "2.1.0", []string{"2.1.0"}, map[uint64]uint64{}},
	}))
	mock.ExpectQuery(`SELECT uniq\(session\) FROM`).WithArgs(anyArgs(18)...).WillReturnRows(cmock.NewRows([]cmock.ColumnType{{Name: "sessions", Type: "UInt64"}}, [][]any{{uint64(40)}}))

	status, data := serveQuery(t, NewHandler(module).ListErrorGroups, orgID, "/errors", map[string]string{"id": id.StringValue()})
	require.Equal(t, http.StatusOK, status, string(data))

	groups := new(rumtypes.GettableErrorGroups)
	require.NoError(t, json.Unmarshal(data, groups))
	require.Len(t, groups.Groups, 2, "the obfuscated crash and the one of a build without minification group together")

	crash, anr := groups.Groups[0], groups.Groups[1]
	assert.Equal(t, "com.example.shop.CartException", crash.Type)
	assert.Equal(t, rumtypes.ErrorSourceCrash, crash.Source)
	require.NotNil(t, crash.TopFrame)
	assert.Equal(t, "a.b.a", crash.TopFrame.Function)
	require.NotNil(t, crash.TopFrame.Original)
	assert.Equal(t, "com.example.shop.Item.price", crash.TopFrame.Original.Function)
	assert.Equal(t, "Item.kt", crash.TopFrame.Original.File)
	assert.Equal(t, "2.1.0-debug", crash.FirstSeenRelease)

	assert.Equal(t, rumtypes.ExceptionTypeANR, anr.Type)
	assert.Equal(t, rumtypes.ErrorSourceANR, anr.Source)
	require.NotNil(t, anr.TopFrame)
	assert.Equal(t, "com.example.shop.CheckoutActivity.onPay", anr.TopFrame.OriginalFunction())
	assert.NoError(t, mock.ExpectationsWereMet())
}

func TestModuleAndroidErrorEvent(t *testing.T) {
	module, orgID := newTestModule(t)
	id := createTestAndroidApplication(t, module, orgID)
	_, err := module.UploadR8Mapping(context.Background(), orgID, id, "2.1.0", "ci@example.com", strings.NewReader(readR8Fixture(t, "mapping.txt")))
	require.NoError(t, err)
	application, err := module.Get(context.Background(), orgID, id)
	require.NoError(t, err)
	row := &errorEventRow{id: "e1", errorType: "a.a", message: "Cart is empty", source: rumtypes.ErrorSourceCrash, stacktrace: readR8Fixture(t, "crash.txt")}

	testCases := []struct {
		name      string
		release   string
		retraced  bool
		missing   *rumtypes.MissingSourceMap
		eventType string
		function  string
	}{
		{name: "MappedRelease_Retraced", release: "2.1.0", retraced: true, eventType: "com.example.shop.CartException", function: "com.example.shop.Item.price"},
		{name: "ReleaseWithoutMapping_Missing", release: "2.0.0", missing: &rumtypes.MissingSourceMap{Release: "2.0.0", Kind: rumtypes.ArtifactKindR8Mapping}, eventType: "a.a", function: "a.b.a"},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			event, err := module.newErrorEvent(context.Background(), application, &resourceInfo{release: testCase.release}, row)
			require.NoError(t, err)
			assert.Equal(t, testCase.retraced, event.Symbolicated)
			assert.Equal(t, testCase.missing, event.MissingSourceMap)
			assert.Equal(t, testCase.eventType, event.Type)
			require.NotEmpty(t, event.Frames)
			assert.Equal(t, testCase.function, event.Frames[0].OriginalFunction())
			require.Len(t, event.Causes, 1)
			assert.Equal(t, rumtypes.ErrorCauseRelationCausedBy, event.Causes[0].Relation)
			assert.Equal(t, "java.lang.NullPointerException", event.Causes[0].Type)
			assert.Equal(t, 5, event.Causes[0].OmittedFrames)
			assert.Equal(t, readR8Fixture(t, "crash.txt"), event.Stacktrace, "the raw trace is kept")
		})
	}
}
