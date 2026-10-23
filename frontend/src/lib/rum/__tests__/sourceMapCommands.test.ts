import {
	appUploadCommand,
	cliSnippet,
	curlSnippet,
	npmScriptSnippet,
	uploadCommand,
} from '../sourceMapCommands';

const TARGET = {
	url: 'https://fusescope.example.com',
	applicationId: '0193f2c4-7d1e-7a40-9b2f-5c8e1d3a6b70',
	release: '1.8.0',
};

describe('uploadCommand', () => {
	it.each([
		['1.8.0', 'npx @fusescope/cli sourcemaps upload dist --release 1.8.0'],
		['v2 beta', "npx @fusescope/cli sourcemaps upload dist --release 'v2 beta'"],
		["it's", "npx @fusescope/cli sourcemaps upload dist --release 'it'\\''s'"],
	])('%s', (release, command) => {
		expect(uploadCommand(release)).toBe(command);
	});
});

describe('cliSnippet', () => {
	it('exports the URL and application, never a key', () => {
		const snippet = cliSnippet(TARGET);
		expect(snippet).toContain(
			'export FUSESCOPE_URL=https://fusescope.example.com',
		);
		expect(snippet).toContain(`export FUSESCOPE_APP=${TARGET.applicationId}`);
		expect(snippet).toContain('export FUSESCOPE_API_KEY=…');
		expect(snippet.trim().split('\n').pop()).toBe(
			'npx @fusescope/cli sourcemaps upload dist --release 1.8.0',
		);
	});
});

describe('npmScriptSnippet', () => {
	it('uploads after every build with the package version', () => {
		expect(JSON.parse(npmScriptSnippet())).toStrictEqual({
			scripts: {
				build: 'vite build',
				postbuild:
					'fusescope sourcemaps upload dist --release $npm_package_version --delete-after',
			},
			devDependencies: { '@fusescope/cli': '^0.1.0-beta.0' },
		});
	});
});

describe('curlSnippet', () => {
	it('posts one part per map, named by its URL path', () => {
		const snippet = curlSnippet(TARGET);
		expect(snippet).toContain(
			`"$FUSESCOPE_URL/api/v1/rum/applications/${TARGET.applicationId}/sourcemaps?release=1.8.0"`,
		);
		expect(snippet).toContain('-H "SigNoz-Api-Key: $FUSESCOPE_API_KEY"');
		expect(snippet).toContain(
			'-F "file=@dist/assets/index.js.map;filename=/assets/index.js.map"',
		);
	});

	it('encodes the release in the URL', () => {
		expect(curlSnippet({ ...TARGET, release: '1.8.0+build 7' })).toContain(
			'?release=1.8.0%2Bbuild%207"',
		);
	});
});

describe('appUploadCommand', () => {
	it('names the server and application; the key comes from the environment', () => {
		expect(appUploadCommand(TARGET)).toBe(
			[
				`FUSESCOPE_URL=https://fusescope.example.com FUSESCOPE_APP=${TARGET.applicationId} \\`,
				'  npx @fusescope/cli sourcemaps upload dist --release 1.8.0',
			].join('\n'),
		);
	});
});
