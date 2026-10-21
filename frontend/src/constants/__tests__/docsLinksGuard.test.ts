import { readdirSync, readFileSync } from 'fs';
import { join, relative, sep } from 'path';

const SRC = join(__dirname, '..', '..');
const DOCS_MODULE = join('constants', 'docs.ts');
const HARDCODED_DOCS_URL = /(https?:\/\/)?(www\.)?signoz\.io\/docs/;
const SOURCE_FILE = /\.(ts|tsx|js|jsx)$/;
const TEST_FILE = /\.(test|spec)\.|\.snap$|\.mocks?\./;
const EXCLUDED_DIRS = new Set([
	'__tests__',
	'__test__',
	'tests',
	'__mocks__',
	'mocks',
	'__story_mockdata__',
]);

const SIGNOZ_DOCS_CALL = /signozDocsUrl\(\s*(['"`])([^'"`]*)\1/g;
/** Onboarding catalog entries resolve `link: '/docs/…'` against the SigNoz site. */
const ONBOARDING_DOCS_LINK = /link:\s*(['"`])\/docs(\/[^'"`]*)\1/g;
const DOCUMENTED_TOPICS = new Set([
	'/alerts',
	'/alerts-management/metrics-based-alerts',
	'/alerts-management/log-based-alerts',
	'/alerts-management/trace-based-alerts',
	'/alerts-management/exceptions-based-alerts',
	'/alerts-management/routing-policy',
	'/alerts-management/planned-maintenance#scoping-with-label-expressions',
	'/setup-alerts-notification',
	'/alerts-management/notification-channel/incidentio',
	'/alerts-management/notification-channel/jira#use-a-service-account-recommended',
	'/alerts-management/notification-channel/jsm-ops',
	'/manage/administrator-guide/iam/roles',
	'/manage/administrator-guide/iam/service-accounts',
	'/manage/administrator-guide/iam/service-accounts#step-3-generate-an-api-key',
	'/userguide/retention-period',
	'/instrumentation',
	'/instrumentation/overview',
	'/logs-pipelines/introduction',
	'/userguide/search-syntax',
	'/querying/overview',
	'/userguide/query-builder-v5',
	'/querying/aggregation-grouping#grouping',
	'/querying/aggregation-grouping#legend-formatting',
	'/querying/aggregation-grouping#core-aggregation-functions-logs--traces',
	'/querying/result-manipulation#sorting--limiting',
	'/querying/result-manipulation#conditional-filtering-with-having',
	'/querying/result-manipulation#how-limit-works-for-time-series',
	'/querying/multi-query-analysis#trace-matching',
	'/querying/functions-extended-analysis',
	'/userguide/query-builder-v5#temporal-aggregation-within-each-time-series',
	'/metrics-management/types-and-aggregation#aggregation',
	'/metrics-management/types-and-aggregation#step-2-temporal-aggregation',
	'/metrics-management/types-and-aggregation#step-3-spatial-aggregation',
	'/userguide/logs_clickhouse_queries',
	'/userguide/write-a-metrics-clickhouse-query',
	'/userguide/writing-clickhouse-traces-query#timestamp-bucketing',
	'/userguide/traces',
	'/userguide/traces#traces-view',
	'/userguide/logs_query_builder',
	'/metrics-management/metrics-explorer',
	'/metrics-management/metrics-explorer#saved-views-in-metrics-explorer',
	'/apm-and-distributed-tracing/application-details',
	'/alerts-management/apdex-alerts',
	'/userguide/metrics',
	'/userguide/manage-dashboards',
	'/dashboards/interactivity#cross-panel-sync',
	'/userguide/manage-variables#supported-variable-types',
	'/userguide/manage-variables#note-about-all',
	'/userguide/manage-variables#dynamic-variable-dropdowns-display-values-in-two-sections',
	'/userguide/manage-variables#why-avoid-clickhouse-query-variables',
	'',
	'/introduction',
	'/external-api-monitoring/overview',
	'/metrics-management/send-metrics',
	'/messaging-queues/kafka',
	'/messaging-queues/celery-setup',
	'/cost-meter/overview#get-started',
	'/logs-management/send-logs-to-signoz',
	'/logs-management/features/logs-quick-filters',
	'/traces-management/guides/correlate-traces-and-logs',
	'/traces-management/troubleshooting/faqs#q-why-are-some-spans-missing-from-a-trace',
	'/userguide/query-builder-v5#result-manipulation',
	'/querying/multi-query-analysis#advanced-comparisons',
]);

/** Drops the query string and trailing slash so `/a/?x#b` matches `/a#b`. */
function normalizeDocsPath(path: string): string {
	const [beforeHash, hash] = path.split('#');
	const page = beforeHash.split('?')[0].replace(/\/+$/, '');
	return hash === undefined ? page : `${page}#${hash}`;
}

function sourceFiles(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) {
			return EXCLUDED_DIRS.has(entry.name) ? [] : sourceFiles(path);
		}
		return SOURCE_FILE.test(entry.name) && !TEST_FILE.test(entry.name)
			? [path]
			: [];
	});
}

describe('documentation links', () => {
	it('go through constants/docs instead of hardcoded signoz.io/docs urls', () => {
		const offenders = sourceFiles(SRC)
			.filter((file) => relative(SRC, file) !== DOCS_MODULE)
			.filter((file) => HARDCODED_DOCS_URL.test(readFileSync(file, 'utf8')))
			.map((file) => relative(SRC, file).split(sep).join('/'));

		expect(offenders).toStrictEqual([]);
	});

	it('point topics documented on the FuseScope docs site there', () => {
		const offenders = sourceFiles(SRC).flatMap((file) =>
			[SIGNOZ_DOCS_CALL, ONBOARDING_DOCS_LINK]
				.flatMap((pattern) => [...readFileSync(file, 'utf8').matchAll(pattern)])
				.map(([, , path]) => path.replace(/#?\$\{.*$/, ''))
				.filter((path) => DOCUMENTED_TOPICS.has(normalizeDocsPath(path)))
				.map((path) => `${relative(SRC, file).split(sep).join('/')}: ${path}`),
		);

		expect(offenders).toStrictEqual([]);
	});
});
