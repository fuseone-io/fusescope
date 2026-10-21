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

/** `signozDocsUrl(…)` calls, signoz.io/signoz.cloud urls and addresses. */
const SIGNOZ_LINK =
	/signozDocsUrl\([^)]*\)|https?:\/\/(?:[\w-]+\.)*signoz\.(?:io|cloud)[^\s'"`)]*|[\w.+-]+@signoz\.(?:io|cloud)/g;
const NON_APP_DIRS = new Set(['__mockdata__', 'storybook']);

/**
 * SigNoz links the community build never shows: each sits behind a cloud or
 * enterprise licence check, or is not a link a user follows.
 */
const ALLOWED_SIGNOZ_LINKS = new Set([
	// Filters SigNoz's own cloud admin account out of user lists.
	'AppRoutes/Private.tsx: admin@signoz.cloud',
	// Release notes feed.
	'api/changelog/getChangelogByVersion.ts: https://cms.signoz.cloud/api/release-changelogs?${queryParams}',
	// Changelog modal opens for cloud workspaces only.
	'components/ChangelogModal/ChangelogModal.tsx: https://signoz.io/upgrade-path',
	// Licence expiry banners.
	'container/AppLayout/index.tsx: support@signoz.io',
	'container/AppLayout/index.tsx: https://signoz.io/terms-of-service',
	// Billing, custom domain and cloud workspace settings.
	'container/BillingContainer/BillingContainer.tsx: cloud-support@signoz.io',
	'container/BillingContainer/BillingContainer.tsx: https://signoz.io/pricing/',
	'container/BillingContainer/CancelSubscriptionBanner.tsx: cloud-support@signoz.io',
	'container/CustomDomainSettings/CustomDomainEditModal.tsx: https://signoz.io/support',
	'container/GeneralSettingsCloud/GeneralSettingsCloud.tsx: cloud-support@signoz.io',
	// Ingestion keys exist only with the cloud ingestion gateway.
	"container/IngestionSettings/MultiIngestionSettings.tsx: signozDocsUrl('/ingestion/signoz-cloud/keys/')",
	"container/OnboardingV2Container/IngestionDetails/IngestionDetails.tsx: signozDocsUrl('/ingestion/signoz-cloud/keys/')",
	// One-click AWS, Azure and GCP integrations.
	'container/Integrations/constants.ts: integrations@signoz.io',
	'container/Integrations/constants.ts: https://signoz.io',
	'container/Integrations/CloudIntegration/Header/Header.tsx: https://signoz.io/blog/native-aws-integrations-with-autodiscovery/',
	"container/Integrations/CloudIntegration/GoogleCloudPlatform/AddNewAccount/SetupGuideCallout.tsx: signozDocsUrl('/integrations/gcp/gcp-integration/')",
	// Hosted MCP server.
	"container/MCPServerSettings/clients.ts: signozDocsUrl('/ai/use-cases/')",
	// Custom roles.
	"container/RolesSettings/CreateEditRolePage/components/ItemInputSelector.tsx: signozDocsUrl('/manage/administrator-guide/iam/permissions/')",
	// Cloud trial, support and workspace states.
	'pages/Services/components/ServicesList/TrialRpsWarning.tsx: cloud-support@signoz.io',
	'pages/Support/Support.tsx: https://signoz.io/slack',
	'pages/WorkspaceAccessRestricted/WorkspaceAccessRestricted.tsx: cloud-support@signoz.io',
	'pages/WorkspaceAccessRestricted/WorkspaceAccessRestricted.tsx: https://signoz.io/terms-of-service',
	'pages/WorkspaceLocked/WorkspaceLocked.tsx: cloud-support@signoz.io',
	'pages/WorkspaceSuspended/WorkspaceSuspended.tsx: cloud-support@signoz.io',
	// Example in a comment.
	'utils/linkifyText.tsx: https://signoz.io.',
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

	it('send community users to FuseScope docs, not SigNoz', () => {
		const links = new Set(
			sourceFiles(SRC)
				.map((file) => relative(SRC, file).split(sep).join('/'))
				.filter((file) => file !== 'constants/docs.ts')
				.filter((file) => !file.split('/').some((dir) => NON_APP_DIRS.has(dir)))
				.flatMap((file) =>
					[...readFileSync(join(SRC, file), 'utf8').matchAll(SIGNOZ_LINK)].map(
						([link]) =>
							`${file}: ${link.replace(/\(\s+/, '(').replace(/,?\s+\)$/, ')')}`,
					),
				),
		);

		expect(
			[...links].filter((link) => !ALLOWED_SIGNOZ_LINKS.has(link)),
		).toStrictEqual([]);
		expect(
			[...ALLOWED_SIGNOZ_LINKS].filter((link) => !links.has(link)),
		).toStrictEqual([]);
	});
});
