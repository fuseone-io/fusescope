import type {
	RumtypesErrorEventDTO,
	RumtypesTimelineEventDTO,
} from 'api/generated/services/fuseScope.schemas';
import {
	RumtypesLoadingTypeDTO,
	RumtypesTimelineEventKindDTO,
} from 'api/generated/services/fuseScope.schemas';

import {
	beforeError,
	breadcrumbItems,
	describeBreadcrumb,
	eventPosition,
	topBrowser,
} from '../ErrorDetail/utils';

const client = (browser: string, browserVersion: string) => ({
	browser,
	browserVersion,
	device: '',
	os: 'Windows',
	osVersion: '10',
});

const event = (
	id: string,
	patch: Partial<RumtypesErrorEventDTO> = {},
): RumtypesErrorEventDTO => ({
	id,
	timestamp: '2026-10-23T14:06:12.000Z',
	sessionId: 's1',
	route: '/cart',
	release: '1.8.0',
	client: client('Chrome', '130'),
	type: 'HttpError',
	message: 'POST /api/cart returned 502',
	source: 'unhandledrejection',
	stacktrace: '',
	frames: [],
	causes: [],
	symbolicated: false,
	missingSourceMap: null,
	componentStack: null,
	truncated: false,
	...patch,
});

describe('breadcrumbItems', () => {
	const view: RumtypesTimelineEventDTO = {
		kind: RumtypesTimelineEventKindDTO.view,
		timestamp: '2026-10-23T14:05:30.800Z',
		route: '/cart',
	};

	it('ends with the error itself', () => {
		const items = breadcrumbItems([view], event('e1'), 'fp1');
		expect(items).toHaveLength(2);
		expect(items[1]).toMatchObject({
			kind: 'error',
			timestamp: '2026-10-23T14:06:12.000Z',
			error: {
				fingerprint: 'fp1',
				type: 'HttpError',
				message: 'POST /api/cart returned 502',
				source: 'unhandledrejection',
			},
		});
	});

	it('is only the error without breadcrumbs', () => {
		expect(breadcrumbItems(null, event('e1'), 'fp1')).toHaveLength(1);
	});
});

describe('beforeError', () => {
	it.each([
		['2026-10-23T14:06:12.000Z', '0:00.0'],
		['2026-10-23T14:06:11.300Z', '−0:00.7'],
		['2026-10-23T14:04:44.700Z', '−1:27.3'],
	])('%s', (at, clock) => {
		expect(beforeError(at, '2026-10-23T14:06:12.000Z')).toBe(clock);
	});
});

describe('topBrowser', () => {
	it('names the most common browser of the events', () => {
		expect(
			topBrowser([
				event('a'),
				event('b', { client: client('Safari', '18') }),
				event('c'),
			]),
		).toStrictEqual({ label: 'Chrome 130', share: '67% of latest events' });
	});

	it('is undefined without a browser', () => {
		expect(topBrowser([event('a', { client: client('', '') })])).toBeUndefined();
	});
});

describe('eventPosition', () => {
	const events = [event('newest'), event('middle'), event('oldest')];

	it.each([
		['newest', { index: 0, newer: undefined, older: 'middle' }],
		['oldest', { index: 2, newer: 'middle', older: undefined }],
		['unknown', { index: 0, newer: undefined, older: 'middle' }],
	])('%s', (selected, position) => {
		expect(eventPosition(events, selected)).toStrictEqual(position);
	});
});

describe('describeBreadcrumb', () => {
	it('names a view by its route and how it loaded', () => {
		expect(
			describeBreadcrumb({
				kind: RumtypesTimelineEventKindDTO.view,
				timestamp: '2026-10-23T14:05:30.800Z',
				route: '/product/:id',
				view: {
					spanId: 's',
					path: '/product/90417',
					loadingType: RumtypesLoadingTypeDTO.route_change,
					durationMs: 1,
				},
			}),
		).toStrictEqual({
			label: 'View',
			title: '/product/:id',
			detail: '/product/90417 · SPA navigation',
			tone: 'neutral',
		});
	});

	it('says a click as the timeline does', () => {
		expect(
			describeBreadcrumb({
				kind: RumtypesTimelineEventKindDTO.click,
				timestamp: '2026-10-23T14:05:30.800Z',
				route: '/cart',
				action: { type: 'click', name: '', target: 'button.qty-increase' },
			}),
		).toMatchObject({ label: 'Click', title: 'button.qty-increase' });
	});
});
