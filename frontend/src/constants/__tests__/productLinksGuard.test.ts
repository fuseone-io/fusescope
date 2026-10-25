import { readdirSync, readFileSync } from 'fs';
import { join, relative } from 'path';

const FRONTEND = join(__dirname, '..', '..', '..');
const EXCLUDED_DIRS = new Set([
	'__tests__',
	'__test__',
	'tests',
	'__mocks__',
	'mocks',
	'__mockdata__',
	'__story_mockdata__',
	'storybook',
	'stories',
]);
const URL_PATTERN = /https?:\/\/[^\s'"`<>)}]+/g;
// Pricing belongs to the licensing UI removal in #23; docs keep an upstream fallback.
const ALLOWED = new Set([
	'src/constants/docs.ts: https://signoz.io',
	'src/container/BillingContainer/BillingContainer.tsx: https://signoz.io/pricing/',
	'src/utils/linkifyText.tsx: https://signoz.io.',
]);

function filesIn(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) {
			return EXCLUDED_DIRS.has(entry.name) ? [] : filesIn(path);
		}
		return /\.(tsx?|jsx?|json)$/.test(entry.name) &&
			!/\.(test|spec|mocks?)\./.test(entry.name)
			? [path]
			: [];
	});
}

describe('product links', () => {
	it('do not send users to SigNoz product, support or release pages', () => {
		const offenders = [
			...filesIn(join(FRONTEND, 'src')),
			...filesIn(join(FRONTEND, 'public', 'locales')),
		].flatMap((file) =>
			[...readFileSync(file, 'utf8').matchAll(URL_PATTERN)]
				.map(([url]) => url)
				.filter((url) =>
					/^https?:\/\/(?:[\w.-]+\.)?(?:signoz\.io|github\.com)(?:[/.]|$)/i.test(
						url,
					),
				)
				.filter((url) => {
					const { hostname, pathname } = new URL(url);
					return (
						(/(^|\.)signoz\.io$/i.test(hostname) && !pathname.startsWith('/docs/')) ||
						(hostname === 'github.com' &&
							/^\/signoz\/signoz\/(?:issues\/?$|releases(?:\/|$))/i.test(pathname)) ||
						(hostname === 'api.github.com' &&
							/^\/repos\/signoz\/signoz\/releases/i.test(pathname))
					);
				})
				.map((url) => `${relative(FRONTEND, file)}: ${url}`)
				.filter((link) => !ALLOWED.has(link)),
		);

		expect(offenders).toStrictEqual([]);
	});

	it('keeps notification-channel documentation URLs out of translations', () => {
		const offenders = filesIn(join(FRONTEND, 'public', 'locales'))
			.filter((file) => file.endsWith('/channels.json'))
			.filter((file) => /signoz\.io\/docs/.test(readFileSync(file, 'utf8')))
			.map((file) => relative(FRONTEND, file));

		expect(offenders).toStrictEqual([]);
	});
});
