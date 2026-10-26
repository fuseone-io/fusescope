import { withDistTag } from 'lib/rum/distTag';

import { SnippetInput } from '../types';

export const SDK_PACKAGE = '@fusescope/browser';

export const NPM_INSTALL_COMMAND = `npm install ${withDistTag(SDK_PACKAGE)}`;

const VERSION_PLACEHOLDER = "version: '<your app version>'";
const VERSION_COMMENT = '// your release, e.g. from package.json';

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

/**
 * The `init()` call for the npm package. Options left at the SDK's defaults
 * are omitted, so the snippet shows only what this application changes.
 */
export function buildNpmSnippet(input: SnippetInput): string {
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
	return `import { init } from '${SDK_PACKAGE}';\n\ninit({\n${lines
		.map((line) =>
			line === VERSION_PLACEHOLDER
				? `  ${line}, ${VERSION_COMMENT}`
				: `  ${line},`,
		)
		.join('\n')}\n});\n`;
}
