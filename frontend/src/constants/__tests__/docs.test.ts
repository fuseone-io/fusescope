import {
	FUSESCOPE_DOCS_URL,
	fuseScopeDocsUrl,
	SIGNOZ_DOCS_URL,
	signozDocsUrl,
} from '../docs';

describe('docs urls', () => {
	it('exposes the docs roots', () => {
		expect(FUSESCOPE_DOCS_URL).toBe(
			'https://docs.fusescope.fuseone.io',
		);
		expect(SIGNOZ_DOCS_URL).toBe('https://signoz.io/docs');
	});

	it.each([
		[undefined, 'https://signoz.io/docs'],
		['', 'https://signoz.io/docs'],
		['/', 'https://signoz.io/docs/'],
		['/introduction/', 'https://signoz.io/docs/introduction/'],
		['introduction/', 'https://signoz.io/docs/introduction/'],
		['//introduction', 'https://signoz.io/docs/introduction'],
		[
			'/userguide/manage-variables/#note-about-all',
			'https://signoz.io/docs/userguide/manage-variables/#note-about-all',
		],
		[
			'/alerts/?utm_source=product&utm_medium=list-alerts',
			'https://signoz.io/docs/alerts/?utm_source=product&utm_medium=list-alerts',
		],
		['#anchor', 'https://signoz.io/docs#anchor'],
		['?q=1', 'https://signoz.io/docs?q=1'],
	])('signozDocsUrl(%p) is %p', (path, expected) => {
		expect(signozDocsUrl(path)).toBe(expected);
	});

	it.each([
		[undefined, 'https://docs.fusescope.fuseone.io'],
		[
			'/configuration/sso/',
			'https://docs.fusescope.fuseone.io/configuration/sso/',
		],
		[
			'install/helm/#values',
			'https://docs.fusescope.fuseone.io/install/helm/#values',
		],
	])('fuseScopeDocsUrl(%p) is %p', (path, expected) => {
		expect(fuseScopeDocsUrl(path)).toBe(expected);
	});
});
