import {
	rumErrorsUrl,
	rumErrorUrl,
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

	it('opens the errors, filtered by route, and one group', () => {
		expect(rumErrorsUrl('app-1', { route: '/cart', release: '1.8.0' })).toBe(
			'/frontend/applications/app-1/errors?release=1.8.0&route=%2Fcart',
		);
		expect(rumErrorUrl('app-1', '3fa8b015c0d1e2f3')).toBe(
			'/frontend/applications/app-1/errors/3fa8b015c0d1e2f3',
		);
		expect(
			rumErrorUrl('app-1', '3fa8b015c0d1e2f3', {
				release: '1.8.0',
				eventId: 'ev1',
			}),
		).toBe(
			'/frontend/applications/app-1/errors/3fa8b015c0d1e2f3?release=1.8.0&event=ev1',
		);
	});
});
