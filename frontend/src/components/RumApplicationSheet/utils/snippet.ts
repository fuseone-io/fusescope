import { withDistTag } from 'lib/rum/distTag';

import type { RumtypesBundledSDKDTO } from 'api/generated/services/fuseScope.schemas';

import { ScriptSource, SnippetInput } from '../types';

export const SDK_PACKAGE = '@fusescope/browser';

export const NPM_INSTALL_COMMAND = `npm install ${withDistTag(SDK_PACKAGE)}`;

const VERSION_PLACEHOLDER = "version: '<your app version>'";
const VERSION_COMMENT = '// your release, e.g. from package.json';
const SCRIPT_VERSION_COMMENT = '// your release';

const literal = (value: string): string =>
	`'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

const list = (values: string[]): string =>
	`[${values.map(literal).join(', ')}]`;

/** Only the privacy options that differ from the SDK defaults. */
function privacyEntries({
	dropQuery,
	queryAllowlist,
	hashUserId,
}: SnippetInput['piiPolicy']): string[] {
	const entries: string[] = [];
	if (!dropQuery) {
		entries.push('dropQuery: false');
	} else if (queryAllowlist?.length) {
		entries.push(`queryAllowlist: ${list(queryAllowlist)}`);
	}
	if (!hashUserId) {
		entries.push('hashUserId: false');
	}
	return entries;
}

function initOptions(input: SnippetInput): string[] {
	const lines = [
		`applicationId: ${literal(input.applicationId)}`,
		`publicKey: ${literal(input.publicKey)}`,
		`endpoint: ${literal(input.endpoint)}`,
		VERSION_PLACEHOLDER,
	];
	if (input.environment) {
		lines.push(`environment: ${literal(input.environment)}`);
	}
	if (input.sampleRate < 1) {
		lines.push(`sessionSampleRate: ${input.sampleRate}`);
	}
	if (input.tracePropagationUrls.length > 0) {
		lines.push(
			`propagateTraceHeaderCorsUrls: ${list(input.tracePropagationUrls)}`,
		);
	}
	if (input.piiPolicy.requireConsent) {
		lines.push('requireConsent: true');
	}
	const privacy = privacyEntries(input.piiPolicy);
	if (privacy.length > 0) {
		lines.push(`privacy: { ${privacy.join(', ')} }`);
	}
	return lines;
}

function initBody(
	input: SnippetInput,
	indent: string,
	versionComment: string,
): string {
	return initOptions(input)
		.map((line) =>
			line === VERSION_PLACEHOLDER
				? `${indent}${line}, ${versionComment}`
				: `${indent}${line},`,
		)
		.join('\n');
}

/**
 * The `init()` call for the npm package. Options left at the SDK's defaults
 * are omitted, so the snippet shows only what this application changes.
 */
export function buildNpmSnippet(input: SnippetInput): string {
	return `import { init } from '${SDK_PACKAGE}';\n\ninit({\n${initBody(
		input,
		'  ',
		VERSION_COMMENT,
	)}\n});\n`;
}

export const SCRIPT_SOURCES: { value: ScriptSource; label: string }[] = [
	{ value: 'self', label: 'This FuseScope' },
	{ value: 'fuseone', label: 'cdn.fuseone.io' },
	{ value: 'jsdelivr', label: 'jsDelivr' },
];

/** Where the page loads the bundle from; every source serves the same file. */
export function scriptSource(
	source: ScriptSource,
	bundle: RumtypesBundledSDKDTO,
	endpoint: string,
): string {
	switch (source) {
		case 'fuseone':
			return `https://cdn.fuseone.io/browser/${bundle.version}/fusescope.min.js`;
		case 'jsdelivr':
			return `https://cdn.jsdelivr.net/npm/${SDK_PACKAGE}@${bundle.version}/dist/fusescope.min.js`;
		default:
			return `${endpoint}${bundle.path}`;
	}
}

/** The bundle's script tag, then the same `init()` as the npm snippet. */
export function buildScriptSnippet(
	input: SnippetInput,
	src: string,
	integrity: string,
): string {
	// `</` inside the inline script would end it early.
	const body = initBody(input, '    ', SCRIPT_VERSION_COMMENT).replace(
		/<\//g,
		'<\\/',
	);
	return `<script\n  src="${src}"\n  integrity="${integrity}"\n  crossorigin="anonymous"\n></script>\n<script>\n  FuseScope.init({\n${body}\n  });\n</script>\n`;
}
