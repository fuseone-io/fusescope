import { signozDocsUrl } from 'constants/docs';

const DOCLINKS = {
	TRACES_EXPLORER_EMPTY_STATE: signozDocsUrl(
		'/instrumentation/overview/?utm_source=product&utm_medium=traces-explorer-empty-state',
	),
	USER_GUIDE: signozDocsUrl('/introduction/'),
	TRACES_DETAILS_LINK: signozDocsUrl(
		'/userguide/traces/?utm_source=product&utm_medium=traces-explorer-trace-tab#traces-view',
	),
	METRICS_EXPLORER_EMPTY_STATE: signozDocsUrl(
		'/metrics-management/send-metrics/',
	),
	EXTERNAL_API_MONITORING: signozDocsUrl('/external-api-monitoring/overview/'),
	QUERY_CLICKHOUSE_TRACES: signozDocsUrl(
		'/userguide/writing-clickhouse-traces-query/#timestamp-bucketing',
	),
	QUERY_CLICKHOUSE_LOGS: signozDocsUrl('/userguide/logs_clickhouse_queries/'),
	QUERY_CLICKHOUSE_METRICS: signozDocsUrl(
		'/userguide/write-a-metrics-clickhouse-query/',
	),
	AGENT_SKILL_INSTALL: signozDocsUrl('/ai/agent-skills/#install-the-plugin'),
};

export default DOCLINKS;
