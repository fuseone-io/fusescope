package implrumapplication

import (
	"context"
	"fmt"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2/lib/driver"
	"github.com/fuseone-io/fusescope/pkg/clickhousesql"
	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/telemetryschema/logstelemetryschema"
	"github.com/fuseone-io/fusescope/pkg/telemetryschema/tracestelemetryschema"
	"github.com/fuseone-io/fusescope/pkg/telemetrystore"
	"github.com/fuseone-io/fusescope/pkg/types/ctxtypes"
	"github.com/fuseone-io/fusescope/pkg/types/instrumentationtypes"
	"github.com/fuseone-io/fusescope/pkg/types/rumtypes"
	sqlbuilder "github.com/huandu/go-sqlbuilder"
)

// bucketSlack covers the 30-minute ts_bucket_start a row is filed under.
const (
	bucketSlack       = 1800
	maxResources      = 20000
	spanKindClient    = 3
	globalAnyLeftJoin = sqlbuilder.JoinOption("GLOBAL ANY LEFT")
	// The default parallel_hash preallocates about 80 MiB per join; the right
	// side here is one row per resource.
	smallJoinSettings   = "SETTINGS join_algorithm = 'hash'"
	navigationRestore   = "restore"
	attributeNavigation = "fusescope.rum.view.navigation_type"
)

var ErrCodeQueryTelemetry = errors.MustNewCode("rum_query_telemetry_failed")

var (
	spanTable         = clickhousesql.Identifier(tracestelemetryschema.DBName) + "." + clickhousesql.Identifier(tracestelemetryschema.SpanIndexV3TableName)
	spanResourceTable = clickhousesql.Identifier(tracestelemetryschema.DBName) + "." + clickhousesql.Identifier(tracestelemetryschema.TracesResourceV3TableName)
	logTable          = clickhousesql.Identifier(logstelemetryschema.DBName) + "." + clickhousesql.Identifier(logstelemetryschema.LogsV2TableName)
	logResourceTable  = clickhousesql.Identifier(logstelemetryschema.DBName) + "." + clickhousesql.Identifier(logstelemetryschema.LogsResourceV2TableName)

	// Unescaped, for Cond helper fields; wrap with sqlbuilder.Escape in compiled text.
	sessionColumn     = clickhousesql.Identifier(promotedColumn(rumtypes.AttributeSessionID, false))
	routeColumn       = clickhousesql.Identifier(promotedColumn(rumtypes.AttributeViewRoute, false))
	applicationColumn = clickhousesql.Identifier(promotedColumn(rumtypes.AttributeApplicationID, true))
	serviceColumn     = clickhousesql.Identifier("resource_string_service$$name")

	eventNameExpr  = attribute(rumtypes.AttributeEventName)
	vitalValueExpr = "attributes_number[" + clickhousesql.StringLiteral(rumtypes.AttributeVitalValue) + "]"
	clientKeyExpr  = fmt.Sprintf("cityHash64(%s, %s, %s)", label(rumtypes.AttributeUserAgent), label(rumtypes.AttributeBrowserBrands), label(rumtypes.AttributeBrowserPlatform))
)

type telemetryReader struct {
	telemetryStore telemetrystore.TelemetryStore
}

type telemetrySignal struct {
	table         string
	resourceTable string
	spans         bool
}

var (
	spanSignal = telemetrySignal{table: spanTable, resourceTable: spanResourceTable, spans: true}
	logSignal  = telemetrySignal{table: logTable, resourceTable: logResourceTable}
)

// telemetryScope restricts a query to one application's telemetry in a range.
type telemetryScope struct {
	applicationID string
	start         time.Time
	end           time.Time
	release       string
	environment   string
	clientKeys    []uint64
}

type resourceInfo struct {
	firstSeen   time.Time
	release     string
	environment string
	client      rumtypes.Client
	clientKey   uint64
}

type backendInfo struct {
	service string
}

func newTelemetryReader(telemetryStore telemetrystore.TelemetryStore) *telemetryReader {
	return &telemetryReader{telemetryStore: telemetryStore}
}

func newTelemetryScope(applicationID string, queryRange rumtypes.QueryRange) telemetryScope {
	return telemetryScope{applicationID: applicationID, start: queryRange.Start, end: queryRange.End, release: queryRange.Release, environment: queryRange.Environment}
}

func (reader *telemetryReader) query(ctx context.Context, function string, sb *sqlbuilder.SelectBuilder, scan func(driver.Rows) error) error {
	query, args := sb.BuildWithFlavor(sqlbuilder.ClickHouse)
	ctx = ctxtypes.NewContextWithCommentVals(ctx, map[string]string{
		instrumentationtypes.CodeNamespace:    "rumapplication",
		instrumentationtypes.CodeFunctionName: function,
	})

	rows, err := reader.telemetryStore.ClickhouseDB().Query(ctx, query, args...)
	if err != nil {
		return errors.WrapInternalf(err, ErrCodeQueryTelemetry, "failed to query rum telemetry: %s", function)
	}
	defer rows.Close()

	for rows.Next() {
		if err := scan(rows); err != nil {
			return errors.WrapInternalf(err, ErrCodeQueryTelemetry, "failed to read rum telemetry: %s", function)
		}
	}
	if err := rows.Err(); err != nil {
		return errors.WrapInternalf(err, ErrCodeQueryTelemetry, "failed to read rum telemetry: %s", function)
	}
	return nil
}

// Resources returns the application's resources seen in the scope, by fingerprint.
func (reader *telemetryReader) Resources(ctx context.Context, signal telemetrySignal, scope telemetryScope) (map[string]*resourceInfo, error) {
	sb := sqlbuilder.NewSelectBuilder()
	sb.Select(
		"fingerprint",
		"any("+label(rumtypes.AttributeServiceVersion)+")",
		"any("+label(rumtypes.AttributeDeploymentEnvironment)+")",
		"any("+label(rumtypes.AttributeUserAgent)+")",
		"any("+label(rumtypes.AttributeBrowserBrands)+")",
		"any("+label(rumtypes.AttributeBrowserPlatform)+")",
		"any("+clientKeyExpr+")",
		"min(seen_at_ts_bucket_start)",
	)
	sb.From(signal.resourceTable)
	sb.Where(resourceConditions(sb, scope)...)
	sb.GroupBy("fingerprint")
	sb.Limit(maxResources)

	resources := map[string]*resourceInfo{}
	err := reader.query(ctx, "Resources", sb, func(rows driver.Rows) error {
		var fingerprint, userAgent, brands, platform string
		var firstSeen int64
		info := &resourceInfo{}
		if err := rows.Scan(&fingerprint, &info.release, &info.environment, &userAgent, &brands, &platform, &info.clientKey, &firstSeen); err != nil {
			return err
		}
		info.firstSeen = time.Unix(firstSeen, 0).UTC()
		info.client = rumtypes.NewClient(userAgent, brands, platform)
		resources[fingerprint] = info
		return nil
	})
	return resources, err
}

// Backends returns, for the traces that have spans outside RUM, the service
// of their first such span.
func (reader *telemetryReader) Backends(ctx context.Context, traceIDs []string, start time.Time, end time.Time) (map[string]backendInfo, error) {
	backends := map[string]backendInfo{}
	if len(traceIDs) == 0 {
		return backends, nil
	}

	ids := make([]any, 0, len(traceIDs))
	for _, id := range traceIDs {
		ids = append(ids, id)
	}

	sb := sqlbuilder.NewSelectBuilder()
	sb.Select("trace_id", sqlbuilder.Escape("argMin("+serviceColumn+", timestamp)"))
	sb.From(spanTable)
	sb.Where(
		sb.In("trace_id", ids...),
		sb.GE("ts_bucket_start", uint64(start.Unix()-bucketSlack)),
		sb.LE("ts_bucket_start", uint64(end.Unix()+bucketSlack)),
		sb.E(applicationColumn, ""),
	)
	sb.GroupBy("trace_id")

	err := reader.query(ctx, "Backends", sb, func(rows driver.Rows) error {
		var traceID, service string
		if err := rows.Scan(&traceID, &service); err != nil {
			return err
		}
		backends[traceID] = backendInfo{service: service}
		return nil
	})
	return backends, err
}

// scopeConditions keeps the scope's rows of signal: resources first, so the
// primary key prunes on ts_bucket_start and resource_fingerprint.
func scopeConditions(sb *sqlbuilder.SelectBuilder, signal telemetrySignal, scope telemetryScope) []string {
	resources := sqlbuilder.NewSelectBuilder()
	resources.Select("fingerprint").From(signal.resourceTable)
	resources.Where(resourceConditions(resources, scope)...)

	conditions := []string{
		"resource_fingerprint GLOBAL IN (" + sb.Var(resources) + ")",
		sb.GE("ts_bucket_start", uint64(scope.start.Unix()-bucketSlack)),
		sb.LE("ts_bucket_start", uint64(scope.end.Unix())),
	}
	if signal.spans {
		return append(conditions,
			"timestamp >= fromUnixTimestamp64Nano("+sb.Var(scope.start.UnixNano())+")",
			"timestamp <= fromUnixTimestamp64Nano("+sb.Var(scope.end.UnixNano())+")",
		)
	}
	return append(conditions, sb.GE("timestamp", uint64(scope.start.UnixNano())), sb.LE("timestamp", uint64(scope.end.UnixNano())))
}

func resourceConditions(sb *sqlbuilder.SelectBuilder, scope telemetryScope) []string {
	conditions := []string{
		sb.Like("labels", "%"+clickhousesql.LikePattern(`"`+rumtypes.AttributeApplicationID+`":"`+scope.applicationID+`"`)+"%"),
		sb.E(label(rumtypes.AttributeApplicationID), scope.applicationID),
		sb.GE("seen_at_ts_bucket_start", scope.start.Unix()-bucketSlack),
		sb.LE("seen_at_ts_bucket_start", scope.end.Unix()),
	}
	if scope.release != "" {
		conditions = append(conditions, sb.E(label(rumtypes.AttributeServiceVersion), scope.release))
	}
	if scope.environment != "" {
		conditions = append(conditions, sb.E(label(rumtypes.AttributeDeploymentEnvironment), scope.environment))
	}
	switch {
	case scope.clientKeys == nil:
	case len(scope.clientKeys) == 0:
		conditions = append(conditions, "0")
	default:
		keys := make([]any, 0, len(scope.clientKeys))
		for _, key := range scope.clientKeys {
			keys = append(keys, key)
		}
		conditions = append(conditions, sb.In(clientKeyExpr, keys...))
	}
	return conditions
}

// resourceDimension maps a fingerprint to its release and client key, for a
// join on the rows of a query.
func resourceDimension(signal telemetrySignal, scope telemetryScope) *sqlbuilder.SelectBuilder {
	sb := sqlbuilder.NewSelectBuilder()
	sb.Select("fingerprint", "any("+label(rumtypes.AttributeServiceVersion)+") AS release", "any("+clientKeyExpr+") AS client_key")
	sb.From(signal.resourceTable)
	sb.Where(resourceConditions(sb, scope)...)
	sb.GroupBy("fingerprint")
	return sb
}

func label(key string) string {
	return "simpleJSONExtractString(labels, " + clickhousesql.StringLiteral(key) + ")"
}

func attribute(key string) string {
	return "attributes_string[" + clickhousesql.StringLiteral(key) + "]"
}

func literalInt(value int64) string {
	return clickhousesql.Literal(value)
}

func literal(value string) string {
	return clickhousesql.StringLiteral(value)
}

// requestHostExpr is rumtypes.RequestTemplate's host in SQL.
func requestHostExpr(url string) string {
	return fmt.Sprintf("replaceRegexpOne(extract(%s, %s), %s, '')", url, literal(rumtypes.URLAuthorityPattern), literal(rumtypes.HostPortPattern))
}

// requestPathTemplateExpr is rumtypes.TemplatePath in SQL.
func requestPathTemplateExpr(url string) string {
	path := fmt.Sprintf("replaceRegexpOne(replaceRegexpOne(%s, %s, ''), %s, '')", url, literal(rumtypes.URLAuthorityPattern), literal(rumtypes.URLQueryPattern))
	path = "if(" + path + " = '', '/', " + path + ")"
	return fmt.Sprintf("arrayStringConcat(arrayMap(segment -> if(match(segment, %s), %s, segment), splitByChar('/', %s)), '/')", literal(rumtypes.IDSegmentPattern), literal(rumtypes.IDSegmentPlaceholder), path)
}

// errorMessageExpr is rumtypes.NormalizeErrorMessage in SQL.
func errorMessageExpr(message string) string {
	expr := message
	for _, replacement := range rumtypes.ErrorMessageReplacements {
		expr = fmt.Sprintf("replaceRegexpAll(%s, %s, %s)", expr, literal(replacement.Pattern), literal(replacement.Replacement))
	}
	return "trimBoth(" + expr + ")"
}

// stackFrameLineExpr is rumtypes.FirstStackFrameLine in SQL.
func stackFrameLineExpr(stacktrace string) string {
	return fmt.Sprintf("arrayFirst(line -> match(line, %s), splitByChar(%s, %s))", literal(rumtypes.StackFrameLinePattern), literal("\n"), stacktrace)
}
