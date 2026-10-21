import { fuseScopeDocsUrl } from 'constants/docs';

const DOCLINKS = {
	TRACES_EXPLORER_EMPTY_STATE: fuseScopeDocsUrl(
		'/sending-data/instrumentation/',
	),
	USER_GUIDE: fuseScopeDocsUrl('/explore/'),
	TRACES_DETAILS_LINK: fuseScopeDocsUrl('/explore/traces/#views'),
	METRICS_EXPLORER_EMPTY_STATE: fuseScopeDocsUrl('/sending-data/otlp/'),
	EXTERNAL_API_MONITORING: fuseScopeDocsUrl('/analyze/external-apis/'),
	QUERY_CLICKHOUSE_TRACES: fuseScopeDocsUrl(
		'/querying/clickhouse-promql/#tables',
	),
	QUERY_CLICKHOUSE_LOGS: fuseScopeDocsUrl('/querying/clickhouse-promql/'),
	QUERY_CLICKHOUSE_METRICS: fuseScopeDocsUrl('/querying/clickhouse-promql/'),
};

export default DOCLINKS;
