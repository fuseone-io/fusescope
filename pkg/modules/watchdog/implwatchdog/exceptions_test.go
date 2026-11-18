package implwatchdog

import (
	"context"
	"regexp"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	cmock "github.com/SigNoz/clickhouse-go-mock"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/fuseone-io/fusescope/pkg/telemetrystore"
	"github.com/fuseone-io/fusescope/pkg/telemetrystore/telemetrystoretest"
	"github.com/fuseone-io/fusescope/pkg/types/watchdogtypes"
)

var exceptionColumns = []cmock.ColumnType{{Name: "groupID", Type: "String"}, {Name: "service", Type: "String"}, {Name: "exception_type", Type: "String"}, {Name: "first_seen", Type: "DateTime64(9)"}}

func TestTelemetryExceptionReader(t *testing.T) {
	end := evaluatedWindow.End
	lookback := end.Add(-watchdogtypes.ExceptionLookback).UnixNano()
	head := "SELECT groupID, any(serviceName) AS service, any(exceptionType) AS exception_type, min(timestamp) AS first_seen " +
		"FROM `signoz_traces`.`distributed_signoz_error_index_v2` " +
		"WHERE timestamp >= fromUnixTimestamp64Nano(?) AND timestamp <= fromUnixTimestamp64Nano(?) " +
		"AND groupID GLOBAL IN (SELECT groupID FROM `signoz_traces`.`distributed_signoz_error_index_v2` WHERE timestamp >= fromUnixTimestamp64Nano(?) AND timestamp <= fromUnixTimestamp64Nano(?)) " +
		"GROUP BY groupID "
	tail := " ORDER BY first_seen, groupID LIMIT ?"
	cursorAt := end.Add(-5 * time.Minute)
	testCases := []struct {
		name   string
		cursor watchdogtypes.ExceptionCursor
		having string
		args   []any
	}{
		{
			name:   "PastEveryGroupOfCursorTime",
			cursor: watchdogtypes.NewExceptionCursor(cursorAt),
			having: "HAVING first_seen > fromUnixTimestamp64Nano(?)",
			args:   []any{lookback, end.UnixNano(), cursorAt.UnixNano(), end.UnixNano(), cursorAt.UnixNano(), watchdogtypes.ExceptionBatchSize + 1},
		},
		{
			name:   "WithinCursorTime_AfterGroupID",
			cursor: watchdogtypes.ExceptionCursor{FirstSeen: cursorAt, GroupID: "a'b`$0"},
			having: "HAVING (first_seen > fromUnixTimestamp64Nano(?) OR (first_seen = fromUnixTimestamp64Nano(?) AND groupID > ?))",
			args:   []any{lookback, end.UnixNano(), cursorAt.UnixNano(), end.UnixNano(), cursorAt.UnixNano(), cursorAt.UnixNano(), "a'b`$0", watchdogtypes.ExceptionBatchSize + 1},
		},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			store := telemetrystoretest.New(telemetrystore.Config{}, sqlmock.QueryMatcherRegexp)
			firstSeen := cursorAt.Add(time.Minute)
			store.Mock().ExpectQuery("^" + regexp.QuoteMeta(head+testCase.having+tail) + "$").
				WithArgs(testCase.args...).
				WillReturnRows(cmock.NewRows(exceptionColumns, [][]any{{"0f3c9a", "payments", "TimeoutError", firstSeen}}))

			groups, err := newTelemetryExceptionReader(store).ListNewGroups(context.Background(), evaluatedWindow, testCase.cursor)
			require.NoError(t, err)
			require.NoError(t, store.Mock().ExpectationsWereMet())

			require.Len(t, groups, 1)
			assert.Equal(t, "0f3c9a", groups[0].GroupID)
			assert.Equal(t, "payments", groups[0].Service)
			assert.Equal(t, "TimeoutError", groups[0].Type)
			assert.True(t, firstSeen.Equal(groups[0].FirstSeen))
		})
	}
}
