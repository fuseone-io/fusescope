import {
	rumRouteUrl,
	rumSessionsUrl,
	rumSessionUrl,
	rumViewsUrl,
} from '../links';

describe('RUM application links', () => {
	it.each([
		[rumViewsUrl('app-1'), '/frontend/applications/app-1/views'],
		[
			rumRouteUrl('app-1', '/product/:id'),
			'/frontend/applications/app-1/views?route=%2Fproduct%2F%3Aid',
		],
		[rumSessionsUrl('app-1'), '/frontend/applications/app-1/sessions'],
		[
			rumSessionsUrl('app-1', { route: '/cart' }),
			'/frontend/applications/app-1/sessions?route=%2Fcart',
		],
		[
			rumSessionUrl('app-1', 'abc123'),
			'/frontend/applications/app-1/sessions/abc123',
		],
	])('%s', (url, expected) => {
		expect(url).toBe(expected);
	});

	it('keeps the release', () => {
		expect(rumSessionUrl('app-1', 'abc', '1.8.0')).toBe(
			'/frontend/applications/app-1/sessions/abc?release=1.8.0',
		);
		expect(rumRouteUrl('app-1', '/', '1.8.0')).toBe(
			'/frontend/applications/app-1/views?release=1.8.0&route=%2F',
		);
	});
});
