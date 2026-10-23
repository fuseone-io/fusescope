package implonboarding

import (
	"context"
	"net/http"
	"net/http/httptest"
	"net/url"
	"path/filepath"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	cmock "github.com/SigNoz/clickhouse-go-mock"
	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/factory/factorytest"
	"github.com/fuseone-io/fusescope/pkg/global"
	"github.com/fuseone-io/fusescope/pkg/modules/preference/implpreference"
	"github.com/fuseone-io/fusescope/pkg/sqlstore"
	"github.com/fuseone-io/fusescope/pkg/sqlstore/sqlitesqlstore"
	"github.com/fuseone-io/fusescope/pkg/telemetrystore"
	"github.com/fuseone-io/fusescope/pkg/telemetrystore/telemetrystoretest"
	"github.com/fuseone-io/fusescope/pkg/types/onboardingtypes"
	"github.com/fuseone-io/fusescope/pkg/types/preferencetypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func newTestModule(t *testing.T, globalConfig global.Config, collectorEndpoint string) (*module, cmock.ClickConnMockCommon) {
	t.Helper()
	ctx := context.Background()
	sqlStore, err := sqlitesqlstore.New(ctx, factorytest.NewSettings(), sqlstore.Config{
		Provider:   "sqlite",
		Connection: sqlstore.ConnectionConfig{MaxOpenConns: 1},
		Sqlite:     sqlstore.SqliteConfig{Path: filepath.Join(t.TempDir(), "onboarding.db"), Mode: "wal", BusyTimeout: 5 * time.Second, TransactionMode: "deferred"},
	})
	require.NoError(t, err)
	_, err = sqlStore.BunDB().NewCreateTable().Model((*preferencetypes.StorableOrgPreference)(nil)).IfNotExists().Exec(ctx)
	require.NoError(t, err)

	preferenceModule := implpreference.NewModule(implpreference.NewStore(sqlStore), preferencetypes.NewAvailablePreference())
	telemetryStore := telemetrystoretest.New(telemetrystore.Config{}, sqlmock.QueryMatcherRegexp)
	return NewModule(telemetryStore, preferenceModule, globalConfig, collectorEndpoint, factorytest.NewSettings()).(*module), telemetryStore.Mock()
}

func statusRows(columns []cmock.ColumnType, values ...any) *cmock.Rows {
	return cmock.NewRows(columns, [][]any{values})
}

var (
	traceColumns  = []cmock.ColumnType{{Name: "count", Type: "UInt64"}, {Name: "first", Type: "Int64"}, {Name: "last", Type: "Int64"}, {Name: "operations", Type: "UInt64"}}
	metricColumns = []cmock.ColumnType{{Name: "count", Type: "UInt64"}, {Name: "first", Type: "Int64"}, {Name: "last", Type: "Int64"}, {Name: "series", Type: "UInt64"}}
	logColumns    = []cmock.ColumnType{{Name: "count", Type: "UInt64"}, {Name: "first", Type: "Int64"}, {Name: "last", Type: "Int64"}}
)

func TestGetStatus_AllSignals(t *testing.T) {
	module, mock := newTestModule(t, global.Config{}, "")
	now := time.Date(2026, 10, 23, 12, 0, 0, 0, time.UTC)
	query, err := onboardingtypes.NewStatusQuery(onboardingtypes.QueryableStatus{}, now)
	require.NoError(t, err)

	mock.ExpectQuery(`SELECT count\(\), toUnixTimestamp64Milli\(min\(timestamp\)\), toUnixTimestamp64Milli\(max\(timestamp\)\), uniq\(name\) FROM .signoz_traces.\..distributed_signoz_index_v3. WHERE ts_bucket_start >= \? AND ts_bucket_start <= \? AND timestamp >= fromUnixTimestamp64Nano\(\?\) AND timestamp <= fromUnixTimestamp64Nano\(\?\)$`).
		WithArgs(uint64(now.Add(-time.Hour).Unix()-1800), uint64(now.Unix()), now.Add(-time.Hour).UnixNano(), now.UnixNano()).
		WillReturnRows(statusRows(traceColumns, uint64(214), int64(1761220000000), int64(1761220900000), uint64(12)))
	mock.ExpectQuery(`SELECT count\(\), min\(unix_milli\), max\(unix_milli\), uniq\(fingerprint\) FROM .signoz_metrics.\..distributed_samples_v4. WHERE unix_milli >= \? AND unix_milli <= \? AND metric_name NOT LIKE \? AND metric_name NOT LIKE \?$`).
		WithArgs(now.Add(-time.Hour).UnixMilli(), now.UnixMilli(), `signoz\_%`, `otelcol\_%`).
		WillReturnRows(statusRows(metricColumns, uint64(0), int64(0), int64(0), uint64(0)))
	mock.ExpectQuery(`SELECT count\(\), toInt64\(intDiv\(min\(timestamp\), 1000000\)\), toInt64\(intDiv\(max\(timestamp\), 1000000\)\) FROM .signoz_logs.\..distributed_logs_v2. WHERE ts_bucket_start >= \? AND ts_bucket_start <= \? AND timestamp >= \? AND timestamp <= \?$`).
		WithArgs(uint64(now.Add(-time.Hour).Unix()-1800), uint64(now.Unix()), uint64(now.Add(-time.Hour).UnixNano()), uint64(now.UnixNano())).
		WillReturnRows(statusRows(logColumns, uint64(57), int64(1761220100000), int64(1761220800000)))

	status, err := module.GetStatus(context.Background(), query)
	require.NoError(t, err)
	require.NoError(t, mock.ExpectationsWereMet())

	assert.Nil(t, status.Service)
	require.NotNil(t, status.Traces)
	assert.True(t, status.Traces.Received)
	assert.Equal(t, uint64(214), status.Traces.Count)
	assert.Equal(t, uint64(12), status.Traces.Operations)
	require.NotNil(t, status.Traces.FirstSeen)
	assert.Equal(t, int64(1761220000000), *status.Traces.FirstSeen)

	require.NotNil(t, status.Metrics)
	assert.False(t, status.Metrics.Received)
	assert.Nil(t, status.Metrics.FirstSeen)

	require.NotNil(t, status.Logs)
	assert.True(t, status.Logs.Received)
	assert.Equal(t, uint64(57), status.Logs.Count)
	require.NotNil(t, status.Logs.LastSeen)
	assert.Equal(t, int64(1761220800000), *status.Logs.LastSeen)
}

func TestGetStatus_ServiceFilter(t *testing.T) {
	module, mock := newTestModule(t, global.Config{}, "")
	now := time.Date(2026, 10, 23, 12, 0, 0, 0, time.UTC)
	service := "check`out'$0"
	query, err := onboardingtypes.NewStatusQuery(onboardingtypes.QueryableStatus{Signals: "traces,metrics,logs", Service: service}, now)
	require.NoError(t, err)
	since := now.Add(-time.Hour)

	mock.ExpectQuery(`FROM .signoz_traces.\..distributed_signoz_index_v3. WHERE resource_fingerprint GLOBAL IN \(SELECT fingerprint FROM .signoz_traces.\..distributed_traces_v3_resource. WHERE simpleJSONExtractString\(labels, 'service.name'\) = \? AND seen_at_ts_bucket_start >= \? AND seen_at_ts_bucket_start <= \?\) AND ts_bucket_start >= \?`).
		WithArgs(service, since.Unix()-1800, now.Unix(), uint64(since.Unix()-1800), uint64(now.Unix()), since.UnixNano(), now.UnixNano()).
		WillReturnRows(statusRows(traceColumns, uint64(1), int64(1761220000000), int64(1761220000000), uint64(1)))
	mock.ExpectQuery(`FROM .signoz_metrics.\..distributed_samples_v4. WHERE unix_milli >= \? AND unix_milli <= \? AND metric_name NOT LIKE \? AND metric_name NOT LIKE \? AND fingerprint GLOBAL IN \(SELECT fingerprint FROM .signoz_metrics.\..distributed_time_series_v4. WHERE unix_milli >= \? AND unix_milli <= \? AND JSONExtractString\(labels, 'service.name'\) = \?\)$`).
		WithArgs(since.UnixMilli(), now.UnixMilli(), `signoz\_%`, `otelcol\_%`, since.Truncate(time.Hour).UnixMilli(), now.UnixMilli(), service).
		WillReturnRows(statusRows(metricColumns, uint64(9), int64(1761220000000), int64(1761220000000), uint64(3)))
	mock.ExpectQuery(`FROM .signoz_logs.\..distributed_logs_v2. WHERE resource_fingerprint GLOBAL IN \(SELECT fingerprint FROM .signoz_logs.\..distributed_logs_v2_resource. WHERE simpleJSONExtractString\(labels, 'service.name'\) = \?`).
		WithArgs(service, since.Unix()-1800, now.Unix(), uint64(since.Unix()-1800), uint64(now.Unix()), uint64(since.UnixNano()), uint64(now.UnixNano())).
		WillReturnRows(statusRows(logColumns, uint64(0), int64(0), int64(0)))

	status, err := module.GetStatus(context.Background(), query)
	require.NoError(t, err)
	require.NoError(t, mock.ExpectationsWereMet())

	require.NotNil(t, status.Service)
	assert.Equal(t, service, *status.Service)
	assert.True(t, status.Traces.Received)
	assert.Equal(t, uint64(3), status.Metrics.Series)
	assert.False(t, status.Logs.Received)
}

func TestGetStatus_OnlyRequestedSignalsQueried(t *testing.T) {
	module, mock := newTestModule(t, global.Config{}, "")
	query, err := onboardingtypes.NewStatusQuery(onboardingtypes.QueryableStatus{Signals: "logs"}, time.Now())
	require.NoError(t, err)

	mock.ExpectQuery(`FROM .signoz_logs.\..distributed_logs_v2.`).WithArgs(make([]any, 4)...).WillReturnRows(statusRows(logColumns, uint64(0), int64(0), int64(0)))

	status, err := module.GetStatus(context.Background(), query)
	require.NoError(t, err)
	require.NoError(t, mock.ExpectationsWereMet())
	assert.Nil(t, status.Traces)
	assert.Nil(t, status.Metrics)
	assert.NotNil(t, status.Logs)
}

func TestGetStatus_QueryFails_Internal(t *testing.T) {
	module, mock := newTestModule(t, global.Config{}, "")
	query, err := onboardingtypes.NewStatusQuery(onboardingtypes.QueryableStatus{Signals: "traces"}, time.Now())
	require.NoError(t, err)

	mock.ExpectQuery(`distributed_signoz_index_v3`).WithArgs(make([]any, 4)...).WillReturnError(errors.Newf(errors.TypeInternal, errors.CodeInternal, "boom"))

	_, err = module.GetStatus(context.Background(), query)
	require.Error(t, err)
	assert.True(t, errors.Ast(err, errors.TypeInternal))
}

func TestIngestion_Precedence(t *testing.T) {
	configURL, err := url.Parse("https://ingest.config.io")
	require.NoError(t, err)
	externalURL, err := url.Parse("https://fusescope.acme.io")
	require.NoError(t, err)

	testCases := []struct {
		name           string
		config         global.Config
		update         string
		expectedSource onboardingtypes.IngestionSource
		expectedHTTP   string
	}{
		{name: "Config", config: global.Config{IngestionURL: configURL, ExternalURL: externalURL}, expectedSource: onboardingtypes.IngestionSourceConfig, expectedHTTP: "https://ingest.config.io"},
		{name: "Unset_Derived", config: global.Config{IngestionURL: &url.URL{Host: "<unset>"}, ExternalURL: externalURL}, expectedSource: onboardingtypes.IngestionSourceDerived, expectedHTTP: "http://fusescope.acme.io:4318"},
		{name: "AdminOverride_WinsOverConfig", config: global.Config{IngestionURL: configURL}, update: "https://otlp.acme.io/", expectedSource: onboardingtypes.IngestionSourceOrganization, expectedHTTP: "https://otlp.acme.io"},
		{name: "AdminOverride_WinsOverDerivation", config: global.Config{}, update: "http://collector:4318", expectedSource: onboardingtypes.IngestionSourceOrganization, expectedHTTP: "http://collector:4318"},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			module, _ := newTestModule(t, testCase.config, "")
			orgID := valuer.GenerateUUID()

			ingestion, err := module.GetIngestion(context.Background(), orgID, "request.host:8080")
			require.NoError(t, err)
			if testCase.update != "" {
				ingestion, err = module.UpdateIngestion(context.Background(), orgID, "request.host:8080", &onboardingtypes.UpdatableIngestion{IngestionURL: testCase.update})
				require.NoError(t, err)
			}

			assert.Equal(t, testCase.expectedSource, ingestion.Source)
			assert.Equal(t, testCase.expectedHTTP, ingestion.OTLPHTTPEndpoint)
			assert.False(t, ingestion.AuthRequired)

			again, err := module.GetIngestion(context.Background(), orgID, "request.host:8080")
			require.NoError(t, err)
			assert.Equal(t, ingestion, again)
		})
	}
}

func TestUpdateIngestion_EmptyClearsOverride(t *testing.T) {
	configURL, err := url.Parse("https://ingest.config.io")
	require.NoError(t, err)
	module, _ := newTestModule(t, global.Config{IngestionURL: configURL}, "")
	orgID := valuer.GenerateUUID()

	_, err = module.UpdateIngestion(context.Background(), orgID, "", &onboardingtypes.UpdatableIngestion{IngestionURL: "https://otlp.acme.io"})
	require.NoError(t, err)

	ingestion, err := module.UpdateIngestion(context.Background(), orgID, "", &onboardingtypes.UpdatableIngestion{IngestionURL: ""})
	require.NoError(t, err)
	assert.Equal(t, onboardingtypes.IngestionSourceConfig, ingestion.Source)
	assert.Nil(t, ingestion.OrganizationURL)
}

func TestUpdateIngestion_InvalidURL_NotStored(t *testing.T) {
	module, _ := newTestModule(t, global.Config{}, "")
	orgID := valuer.GenerateUUID()

	_, err := module.UpdateIngestion(context.Background(), orgID, "", &onboardingtypes.UpdatableIngestion{IngestionURL: "ftp://otlp.acme.io"})
	require.Error(t, err)
	assert.True(t, errors.Ast(err, errors.TypeInvalidInput))

	ingestion, err := module.GetIngestion(context.Background(), orgID, "")
	require.NoError(t, err)
	assert.Equal(t, onboardingtypes.IngestionSourceDerived, ingestion.Source)
}

func TestGetIngestion_Collector(t *testing.T) {
	collector := httptest.NewServer(http.HandlerFunc(func(rw http.ResponseWriter, req *http.Request) {
		assert.Equal(t, "/v1/traces", req.URL.Path)
		rw.WriteHeader(http.StatusMethodNotAllowed)
	}))
	defer collector.Close()
	closed := httptest.NewServer(http.NotFoundHandler())
	closed.Close()

	testCases := []struct {
		name              string
		endpoint          string
		expectedReachable bool
	}{
		{name: "Answering_Reachable", endpoint: collector.URL + "/", expectedReachable: true},
		{name: "Down_Unreachable", endpoint: closed.URL, expectedReachable: false},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			module, _ := newTestModule(t, global.Config{}, testCase.endpoint)

			ingestion, err := module.GetIngestion(context.Background(), valuer.GenerateUUID(), "")
			require.NoError(t, err)
			require.NotNil(t, ingestion.Collector)
			assert.Equal(t, testCase.endpoint, ingestion.Collector.Endpoint)
			assert.Equal(t, testCase.expectedReachable, ingestion.Collector.Reachable)
		})
	}

	module, _ := newTestModule(t, global.Config{}, "")
	ingestion, err := module.GetIngestion(context.Background(), valuer.GenerateUUID(), "")
	require.NoError(t, err)
	assert.Nil(t, ingestion.Collector)
}
