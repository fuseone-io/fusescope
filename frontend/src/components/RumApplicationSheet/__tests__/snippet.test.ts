import { SnippetInput } from '../types';
import {
	buildNpmSnippet,
	buildScriptSnippet,
	NPM_INSTALL_COMMAND,
	scriptSource,
} from '../utils/snippet';

const BASE: SnippetInput = {
	applicationId: '01a16115-094c-79a3-aa4c-39d2a99907d1',
	environment: 'production',
	publicKey: 'rum_pub_k7q2m4xzan6cw5rthfyp3jav4dlb6eqs',
	endpoint: 'https://fusescope.example.com',
	sampleRate: 1,
	tracePropagationUrls: [],
	piiPolicy: {
		dropQuery: true,
		queryAllowlist: [],
		urlAllowlist: [],
		geoLookup: true,
		requireConsent: false,
		hashUserId: true,
	},
};

const HEAD = `import { init } from '@fusescope/browser';

init({
  applicationId: '01a16115-094c-79a3-aa4c-39d2a99907d1',
  publicKey: 'rum_pub_k7q2m4xzan6cw5rthfyp3jav4dlb6eqs',
  endpoint: 'https://fusescope.example.com',
  version: '<your app version>', // your release, e.g. from package.json
  environment: 'production',`;

describe('buildNpmSnippet', () => {
	it.each<[string, Partial<SnippetInput>, string]>([
		['defaults leave every optional setting out', {}, `${HEAD}\n});\n`],
		[
			'a sample rate below 1 is written as a fraction',
			{ sampleRate: 0.25 },
			`${HEAD}\n  sessionSampleRate: 0.25,\n});\n`,
		],
		[
			'trace propagation URLs are listed',
			{
				tracePropagationUrls: [
					'https://api.shop.example.com',
					'https://cart.example.com',
				],
			},
			`${HEAD}\n  propagateTraceHeaderCorsUrls: ['https://api.shop.example.com', 'https://cart.example.com'],\n});\n`,
		],
		[
			'consent is required only when set',
			{ piiPolicy: { ...BASE.piiPolicy, requireConsent: true } },
			`${HEAD}\n  requireConsent: true,\n});\n`,
		],
		[
			'kept query parameters go under privacy',
			{
				piiPolicy: {
					...BASE.piiPolicy,
					queryAllowlist: ['utm_source', 'page'],
				},
			},
			`${HEAD}\n  privacy: { queryAllowlist: ['utm_source', 'page'] },\n});\n`,
		],
		[
			'keeping query strings and plain user ids are written out',
			{
				piiPolicy: {
					...BASE.piiPolicy,
					dropQuery: false,
					queryAllowlist: ['ignored'],
					hashUserId: false,
				},
			},
			`${HEAD}\n  privacy: { dropQuery: false, hashUserId: false },\n});\n`,
		],
		[
			'quotes in values are escaped',
			{ environment: "o'brien" },
			`import { init } from '@fusescope/browser';

init({
  applicationId: '01a16115-094c-79a3-aa4c-39d2a99907d1',
  publicKey: 'rum_pub_k7q2m4xzan6cw5rthfyp3jav4dlb6eqs',
  endpoint: 'https://fusescope.example.com',
  version: '<your app version>', // your release, e.g. from package.json
  environment: 'o\\'brien',
});
`,
		],
	])('%s', (_name, override, expected) => {
		expect(buildNpmSnippet({ ...BASE, ...override })).toBe(expected);
	});

	it('writes the version as a placeholder to replace, since releases come from the build', () => {
		expect(buildNpmSnippet(BASE)).toContain(
			"\n  version: '<your app version>', // your release, e.g. from package.json\n",
		);
	});
});

describe('NPM_INSTALL_COMMAND', () => {
	it('installs the prerelease dist-tag', () => {
		expect(NPM_INSTALL_COMMAND).toBe('npm install @fusescope/browser@next');
	});
});

const BUNDLE = {
	name: '@fusescope/browser',
	version: '0.2.0-beta.1',
	integrity:
		'sha384-W9beoX1Dd3K5Qeu+f2RfXYn3RF/Z5NSY/TUye/4XmIr7RUnT23UwZSqyiY3UWDAs',
	path: '/rum/v1/sdk/browser/0.2.0-beta.1/fusescope.min.js',
};

describe('scriptSource', () => {
	it.each([
		[
			'self' as const,
			'https://fusescope.example.com/rum/v1/sdk/browser/0.2.0-beta.1/fusescope.min.js',
		],
		[
			'fuseone' as const,
			'https://cdn.fuseone.io/browser/0.2.0-beta.1/fusescope.min.js',
		],
		[
			'jsdelivr' as const,
			'https://cdn.jsdelivr.net/npm/@fusescope/browser@0.2.0-beta.1/dist/fusescope.min.js',
		],
	])('%s', (source, expected) => {
		expect(scriptSource(source, BUNDLE, 'https://fusescope.example.com')).toBe(
			expected,
		);
	});
});

describe('buildScriptSnippet', () => {
	it('loads the bundle with its integrity, then calls FuseScope.init with the npm options', () => {
		expect(
			buildScriptSnippet(
				{ ...BASE, sampleRate: 0.25 },
				'https://cdn.fuseone.io/browser/0.2.0-beta.1/fusescope.min.js',
				BUNDLE.integrity,
			),
		).toBe(`<script
  src="https://cdn.fuseone.io/browser/0.2.0-beta.1/fusescope.min.js"
  integrity="sha384-W9beoX1Dd3K5Qeu+f2RfXYn3RF/Z5NSY/TUye/4XmIr7RUnT23UwZSqyiY3UWDAs"
  crossorigin="anonymous"
></script>
<script>
  FuseScope.init({
    applicationId: '01a16115-094c-79a3-aa4c-39d2a99907d1',
    publicKey: 'rum_pub_k7q2m4xzan6cw5rthfyp3jav4dlb6eqs',
    endpoint: 'https://fusescope.example.com',
    version: '<your app version>', // your release
    environment: 'production',
    sessionSampleRate: 0.25,
  });
</script>
`);
	});

	it('cannot close the inline script from a value', () => {
		expect(
			buildScriptSnippet(
				{ ...BASE, environment: '</script><script>alert(1)' },
				'https://cdn.fuseone.io/browser/0.2.0-beta.1/fusescope.min.js',
				BUNDLE.integrity,
			),
		).toContain("environment: '<\\/script><script>alert(1)',");
	});
});
