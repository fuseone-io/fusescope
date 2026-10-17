export const DOCS_BASE_URL = process.env.DOCS_BASE_URL || 'https://signoz.io';

export const SIGNOZ_DOCS_URL = `${DOCS_BASE_URL}/docs`;

export const FUSESCOPE_DOCS_URL =
	process.env.FUSESCOPE_DOCS_URL ||
	'https://fuseone-io.github.io/fusescope-docs';

/** `path` may start with `/`, `#` or `?`; omitted, it yields the docs root. */
function joinDocsUrl(base: string, path = ''): string {
	if (!path || path.startsWith('#') || path.startsWith('?')) {
		return `${base}${path}`;
	}
	return `${base}/${path.replace(/^\/+/, '')}`;
}

export function signozDocsUrl(path?: string): string {
	return joinDocsUrl(SIGNOZ_DOCS_URL, path);
}

export function fuseScopeDocsUrl(path?: string): string {
	return joinDocsUrl(FUSESCOPE_DOCS_URL, path);
}
