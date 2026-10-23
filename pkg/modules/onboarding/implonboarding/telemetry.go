package implonboarding

import (
	"context"
	"time"

	"github.com/fuseone-io/fusescope/pkg/clickhousesql"
	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/telemetryschema/logstelemetryschema"
	"github.com/fuseone-io/fusescope/pkg/telemetryschema/metricstelemetryschema"
	"github.com/fuseone-io/fusescope/pkg/telemetryschema/tracestelemetryschema"
	"github.com/fuseone-io/fusescope/pkg/telemetrystore"
	"github.com/fuseone-io/fusescope/pkg/types/ctxtypes"
	"github.com/fuseone-io/fusescope/pkg/types/instrumentationtypes"
	"github.com/fuseone-io/fusescope/pkg/types/onboardingtypes"
	sqlbuilder "github.com/huandu/go-sqlbuilder"
)

// bucketSlack covers the 30-minute ts_bucket_start a row is filed under.
const bucketSlack = 1800

var ErrCodeQueryTelemetry = errors.MustNewCode("onboarding_query_telemetry_failed")

var (
	spanTable          = clickhousesql.Identifier(tracestelemetryschema.DBName) + "." + clickhousesql.Identifier(tracestelemetryschema.SpanIndexV3TableName)
	spanResourceTable  = clickhousesql.Identifier(tracestelemetryschema.DBName) + "." + clickhousesql.Identifier(tracestelemetryschema.TracesResourceV3TableName)
	logTable           = clickhousesql.Identifier(logstelemetryschema.DBName) + "." + clickhousesql.Identifier(logstelemetryschema.LogsV2TableName)
	logResourceTable   = clickhousesql.Identifier(logstelemetryschema.DBName) + "." + clickhousesql.Identifier(logstelemetryschema.LogsResourceV2TableName)
	sampleTable        = clickhousesql.Identifier(metricstelemetryschema.DBName) + "." + clickhousesql.Identifier(metricstelemetryschema.SamplesV4TableName)
	timeSeriesTable    = clickhousesql.Identifier(metricstelemetryschema.DBName) + "." + clickhousesql.Identifier(metricstelemetryschema.TimeseriesV4TableName)
	serviceNameLiteral = clickhousesql.StringLiteral("service.name")

	// Metrics FuseScope and its collector emit about themselves, which are not a sign the user's data arrived.
	internalMetricPrefixes = []string{"signoz_", "otelcol_"}
)

type telemetryReader struct {
	telemetryStore telemetrystore.TelemetryStore
}

func newTelemetryReader(telemetryStore telemetrystore.TelemetryStore) *telemetryReader {
	return &telemetryReader{telemetryStore: telemetryStore}
}

func (reader *telemetryReader) Traces(ctx context.Context, query onboardingtypes.StatusQuery) (*onboardingtypes.TracesStatus, error) {
	sb := sqlbuilder.NewSelectBuilder()
	sb.Select("count()", "toUnixTimestamp64Milli(min(timestamp))", "toUnixTimestamp64Milli(max(timestamp))", "uniq(name)")
	sb.From(spanTable)
	sb.Where(bucketConditions(sb, spanResourceTable, query)...)
	sb.Where(
		"timestamp >= fromUnixTimestamp64Nano("+sb.Var(query.Since.UnixNano())+")",
		"timestamp <= fromUnixTimestamp64Nano("+sb.Var(query.Until.UnixNano())+")",
	)

	var count, operations uint64
	var first, last int64
	if err := reader.queryRow(ctx, "Traces", sb, &count, &first, &last, &operations); err != nil {
		return nil, err
	}

	return &onboardingtypes.TracesStatus{SignalStatus: onboardingtypes.NewSignalStatus(count, first, last), Operations: operations}, nil
}

func (reader *telemetryReader) Metrics(ctx context.Context, query onboardingtypes.StatusQuery) (*onboardingtypes.MetricsStatus, error) {
	sb := sqlbuilder.NewSelectBuilder()
	sb.Select("count()", "min(unix_milli)", "max(unix_milli)", "uniq(fingerprint)")
	sb.From(sampleTable)
	sb.Where(sb.GE("unix_milli", query.Since.UnixMilli()), sb.LE("unix_milli", query.Until.UnixMilli()))
	for _, prefix := range internalMetricPrefixes {
		sb.Where(sb.NotLike("metric_name", clickhousesql.LikePattern(prefix)+"%"))
	}
	if query.Service != "" {
		series := sqlbuilder.NewSelectBuilder()
		series.Select("fingerprint").From(timeSeriesTable)
		series.Where(
			series.GE("unix_milli", query.Since.Truncate(time.Hour).UnixMilli()),
			series.LE("unix_milli", query.Until.UnixMilli()),
			series.E("JSONExtractString(labels, "+serviceNameLiteral+")", query.Service),
		)
		sb.Where("fingerprint GLOBAL IN (" + sb.Var(series) + ")")
	}

	var count, seriesCount uint64
	var first, last int64
	if err := reader.queryRow(ctx, "Metrics", sb, &count, &first, &last, &seriesCount); err != nil {
		return nil, err
	}

	return &onboardingtypes.MetricsStatus{SignalStatus: onboardingtypes.NewSignalStatus(count, first, last), Series: seriesCount}, nil
}

func (reader *telemetryReader) Logs(ctx context.Context, query onboardingtypes.StatusQuery) (*onboardingtypes.SignalStatus, error) {
	sb := sqlbuilder.NewSelectBuilder()
	sb.Select("count()", "toInt64(intDiv(min(timestamp), 1000000))", "toInt64(intDiv(max(timestamp), 1000000))")
	sb.From(logTable)
	sb.Where(bucketConditions(sb, logResourceTable, query)...)
	sb.Where(sb.GE("timestamp", uint64(query.Since.UnixNano())), sb.LE("timestamp", uint64(query.Until.UnixNano())))

	var count uint64
	var first, last int64
	if err := reader.queryRow(ctx, "Logs", sb, &count, &first, &last); err != nil {
		return nil, err
	}

	status := onboardingtypes.NewSignalStatus(count, first, last)
	return &status, nil
}

func (reader *telemetryReader) queryRow(ctx context.Context, function string, sb *sqlbuilder.SelectBuilder, dest ...any) error {
	query, args := sb.BuildWithFlavor(sqlbuilder.ClickHouse)
	ctx = ctxtypes.NewContextWithCommentVals(ctx, map[string]string{
		instrumentationtypes.CodeNamespace:    "onboarding",
		instrumentationtypes.CodeFunctionName: function,
	})

	rows, err := reader.telemetryStore.ClickhouseDB().Query(ctx, query, args...)
	if err != nil {
		return errors.WrapInternalf(err, ErrCodeQueryTelemetry, "failed to query onboarding status: %s", function)
	}
	defer rows.Close()

	if rows.Next() {
		if err := rows.Scan(dest...); err != nil {
			return errors.WrapInternalf(err, ErrCodeQueryTelemetry, "failed to read onboarding status: %s", function)
		}
	}
	if err := rows.Err(); err != nil {
		return errors.WrapInternalf(err, ErrCodeQueryTelemetry, "failed to read onboarding status: %s", function)
	}

	return nil
}

// bucketConditions filters on the primary key: the service's resource
// fingerprints first when one is asked for, then ts_bucket_start.
func bucketConditions(sb *sqlbuilder.SelectBuilder, resourceTable string, query onboardingtypes.StatusQuery) []string {
	conditions := []string{}
	if query.Service != "" {
		resources := sqlbuilder.NewSelectBuilder()
		resources.Select("fingerprint").From(resourceTable)
		resources.Where(
			resources.E("simpleJSONExtractString(labels, "+serviceNameLiteral+")", query.Service),
			resources.GE("seen_at_ts_bucket_start", query.Since.Unix()-bucketSlack),
			resources.LE("seen_at_ts_bucket_start", query.Until.Unix()),
		)
		conditions = append(conditions, "resource_fingerprint GLOBAL IN ("+sb.Var(resources)+")")
	}

	return append(conditions,
		sb.GE("ts_bucket_start", uint64(query.Since.Unix()-bucketSlack)),
		sb.LE("ts_bucket_start", uint64(query.Until.Unix())),
	)
}
