export const CLI_PACKAGE = '@fusescope/cli';
export const CLI_VERSION_RANGE = '^0.1.0-beta.0';
export const BUILD_DIR = 'dist';

export interface UploadTarget {
	/** FuseScope base URL. */
	url: string;
	applicationId: string;
	release: string;
}

const SAFE = /^[\w.+@%/:=-]+$/;

/** A POSIX shell word: as is when safe, else single-quoted. */
export function shellQuote(value: string): string {
	return SAFE.test(value) ? value : `'${value.replaceAll("'", "'\\''")}'`;
}

export const uploadCommand = (release: string): string =>
	`npx ${CLI_PACKAGE} sourcemaps upload ${BUILD_DIR} --release ${shellQuote(release)}`;

/** One release's upload for one application; `FUSESCOPE_API_KEY` stays in the environment. */
export function appUploadCommand(target: UploadTarget): string {
	return [
		`FUSESCOPE_URL=${shellQuote(target.url)} FUSESCOPE_APP=${shellQuote(target.applicationId)} \\`,
		`  ${uploadCommand(target.release)}`,
	].join('\n');
}

/** Environment, then the upload; the API key stays a placeholder. */
export function cliSnippet(target: UploadTarget): string {
	return [
		'# once, in CI or your shell',
		`export FUSESCOPE_URL=${shellQuote(target.url)}`,
		`export FUSESCOPE_APP=${shellQuote(target.applicationId)}`,
		'export FUSESCOPE_API_KEY=…',
		'',
		'# after every production build',
		uploadCommand(target.release),
	].join('\n');
}

export function npmScriptSnippet(): string {
	return JSON.stringify(
		{
			scripts: {
				build: 'vite build',
				postbuild: `fusescope sourcemaps upload ${BUILD_DIR} --release $npm_package_version --delete-after`,
			},
			devDependencies: { [CLI_PACKAGE]: CLI_VERSION_RANGE },
		},
		null,
		2,
	);
}

export function curlSnippet(target: UploadTarget): string {
	const endpoint = `$FUSESCOPE_URL/api/v1/rum/applications/${target.applicationId}/sourcemaps?release=${encodeURIComponent(target.release)}`;
	return [
		`curl -X POST "${endpoint}" \\`,
		'  -H "SigNoz-Api-Key: $FUSESCOPE_API_KEY" \\',
		`  -F "file=@${BUILD_DIR}/assets/index.js.map;filename=/assets/index.js.map" \\`,
		`  -F "file=@${BUILD_DIR}/assets/vendor.js.map;filename=/assets/vendor.js.map"`,
	].join('\n');
}
