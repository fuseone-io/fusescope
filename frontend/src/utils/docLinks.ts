import { fuseScopeDocsUrl, signozDocsUrl } from 'constants/docs';

const DOCLINKS = {
	TRACES_EXPLORER_EMPTY_STATE: fuseScopeDocsUrl(
		'/sending-data/instrumentation/',
	),
	USER_GUIDE: signozDocsUrl('/introduction/'),
	TRACES_DETAILS_LINK: fuseScopeDocsUrl('/explore/traces/#views'),
	METRICS_EXPLORER_EMPTY_STATE: signozDocsUrl(
		'/metrics-management/send-metrics/',
	),
	EXTERNAL_API_MONITORING: signozDocsUrl('/external-api-monitoring/overview/'),
	QUERY_CLICKHOUSE_TRACES: fuseScopeDocsUrl(
		'/querying/clickhouse-promql/#tables',
	),
	QUERY_CLICKHOUSE_LOGS: fuseScopeDocsUrl('/querying/clickhouse-promql/'),
	QUERY_CLICKHOUSE_METRICS: fuseScopeDocsUrl('/querying/clickhouse-promql/'),
	AGENT_SKILL_INSTALL: signozDocsUrl('/ai/agent-skills/#install-the-plugin'),
};

export default DOCLINKS;
