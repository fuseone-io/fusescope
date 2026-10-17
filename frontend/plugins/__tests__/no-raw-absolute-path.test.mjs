import { ruleTester } from './rule-tester.mjs';

const WINDOW_OPEN =
	'Use openInNewTab(path) instead of window.open(path, "_blank") — openInNewTab prepends the base path automatically.';

await ruleTester({
	rule: 'no-raw-absolute-path',
	valid: [
		{
			name: 'external string literal',
			code: "window.open('https://example.com', '_blank');",
		},
		{
			name: 'withBasePath call',
			code: "window.open(withBasePath('/logs'), '_blank');",
		},
		{
			name: 'signozDocsUrl call',
			code: "window.open(signozDocsUrl('/alerts/'), '_blank');",
		},
		{
			name: 'fuseScopeDocsUrl call',
			code: "window.open(fuseScopeDocsUrl('/configuration/sso/'), '_blank');",
		},
	],
	invalid: [
		{
			name: 'internal path',
			code: "window.open('/logs', '_blank');",
			errors: [{ message: WINDOW_OPEN, line: 1, column: 1 }],
		},
		{
			name: 'unknown helper call',
			code: "window.open(buildUrl('/logs'), '_blank');",
			errors: [{ message: WINDOW_OPEN, line: 1, column: 1 }],
		},
	],
});
