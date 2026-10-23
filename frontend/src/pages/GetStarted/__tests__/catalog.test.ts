import { GUIDES } from '../guides/registry';
import { CATALOG_SECTIONS } from '../constants';
import { catalogEntryLink, filterCatalog } from '../utils';

/** Pages published on the FuseScope docs site (fusescope-docs/src/content/docs). */
const PUBLISHED_DOCS_SLUGS = new Set([
	'sending-data/instrumentation',
	'sending-data/instrumentation/java',
	'sending-data/instrumentation/dotnet',
	'sending-data/instrumentation/nodejs',
	'sending-data/instrumentation/python',
	'sending-data/instrumentation/go',
	'sending-data/instrumentation/ruby',
	'sending-data/instrumentation/php',
	'sending-data/collector-docker',
	'sending-data/collector-vm',
	'sending-data/kubernetes',
	'sending-data/hosts',
	'sending-data/prometheus',
	'sending-data/logs-files',
	'sending-data/logs-kubernetes',
	'sending-data/logs-syslog',
	'sending-data/logs-fluent',
	'sending-data/otlp',
	'sending-data/data-source-catalog',
	'sending-data/integrations',
	'sending-data/integrations/clickhouse',
	'sending-data/integrations/mongodb',
	'sending-data/integrations/nginx',
	'sending-data/integrations/postgresql',
	'sending-data/integrations/redis',
	'sending-data/integrations/aws-rds-mysql',
	'sending-data/integrations/aws-rds-postgresql',
	'sending-data/integrations/aws-elasticache-redis',
	'frontend/set-up-web',
	'frontend/source-maps',
	'analyze/ai-observability',
	'analyze/ai-observability-python',
	'analyze/ai-observability-nodejs',
]);

const ENTRIES = CATALOG_SECTIONS.flatMap((section) => section.entries);

describe('catalog config', () => {
	it('has unique entry ids', () => {
		const ids = ENTRIES.map((entry) => entry.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('files every entry under its own section', () => {
		CATALOG_SECTIONS.forEach((section) => {
			section.entries.forEach((entry) => {
				expect(entry.category).toBe(section.id);
			});
		});
	});

	it.each(ENTRIES.map((entry) => [entry.id, entry.docsSlug]))(
		'%s links a published docs page (%s)',
		(_, slug) => {
			expect(PUBLISHED_DOCS_SLUGS.has(slug)).toBe(true);
		},
	);

	it.each(GUIDES.map((guide) => [guide.id, guide.docsSlug]))(
		'guide %s links a published docs page (%s)',
		(_, slug) => {
			expect(PUBLISHED_DOCS_SLUGS.has(slug)).toBe(true);
		},
	);

	it('points every guide id at a shipped guide', () => {
		const shipped = new Set<string>(GUIDES.map((guide) => guide.id));
		ENTRIES.filter((entry) => entry.guideId).forEach((entry) => {
			expect(shipped.has(entry.guideId ?? '')).toBe(true);
		});
	});

	it('ships the Node.js, Python, Java, .NET and Go guides', () => {
		expect(GUIDES.map((guide) => guide.id).sort()).toStrictEqual(
			['dotnet', 'go', 'java', 'nodejs', 'python'].sort(),
		);
	});
});

describe('catalogEntryLink', () => {
	const entry = ENTRIES[0];

	it.each([
		[
			'an in-app guide',
			{ ...entry, guideId: 'nodejs' as const, appRoute: undefined },
			{ kind: 'app', to: '/get-started/nodejs' },
		],
		[
			'an in-app page',
			{ ...entry, guideId: undefined, appRoute: '/integrations/builtin-redis' },
			{ kind: 'app', to: '/integrations/builtin-redis' },
		],
		[
			'the docs',
			{
				...entry,
				guideId: undefined,
				appRoute: undefined,
				docsSlug: 'sending-data/hosts',
			},
			{
				kind: 'docs',
				href: 'https://fuseone-io.github.io/fusescope-docs/sending-data/hosts/',
			},
		],
	])('opens %s', (_, value, expected) => {
		expect(catalogEntryLink(value)).toStrictEqual(expected);
	});
});

describe('filterCatalog', () => {
	const names = (query: string, filter = 'all' as const): string[] =>
		filterCatalog(CATALOG_SECTIONS, query, filter).flatMap((section) =>
			section.entries.map((entry) => entry.name),
		);

	it('keeps everything with no query and no filter', () => {
		expect(names('')).toHaveLength(ENTRIES.length);
	});

	it.each([
		['java', 'Java'],
		['  NGINX ', 'Nginx'],
		['spring', 'Java'],
		['syslog', 'Syslog'],
		['openai', 'Python LLM apps'],
		['express', 'Node.js'],
	])('finds "%s" by name, description or keyword', (query, expected) => {
		expect(names(query)).toContain(expected);
	});

	it('needs every word to match', () => {
		expect(names('kubernetes logs')).toStrictEqual(['Kubernetes logs']);
	});

	it('drops sections with no match', () => {
		const sections = filterCatalog(CATALOG_SECTIONS, 'redis', 'all');
		expect(sections.map((section) => section.id)).toStrictEqual(['db']);
	});

	it('keeps one section for a category filter', () => {
		const sections = filterCatalog(CATALOG_SECTIONS, '', 'logs');
		expect(sections.map((section) => section.id)).toStrictEqual(['logs']);
	});

	it('shows no section for the OpenTelemetry filter', () => {
		expect(filterCatalog(CATALOG_SECTIONS, '', 'otel')).toStrictEqual([]);
	});

	it('finds nothing for an unknown term', () => {
		expect(names('cobol mainframe')).toStrictEqual([]);
	});
});
