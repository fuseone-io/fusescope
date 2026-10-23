import {
	defaultExpanded,
	describeEvent,
	kindCounts,
	matchesKind,
	requestBars,
	sessionClock,
	sessionFilter,
	viewStrip,
	viewSummary,
} from '../utils';
import { click, error, request, session, vital } from './fixtures';

describe('sessionClock', () => {
	it.each([
		[0, '0:00.0'],
		[22_400, '0:22.4'],
		[372_200, '6:12.2'],
		[-50, '0:00.0'],
	])('%s', (ms, text) => {
		expect(sessionClock(ms)).toBe(text);
	});
});

describe('kindCounts', () => {
	it('counts views and events by kind, leading events included', () => {
		expect(kindCounts(session({ leadingEvents: [click(-10)] }))).toStrictEqual({
			all: 9,
			views: 2,
			actions: 3,
			requests: 2,
			errors: 1,
			vitals: 1,
		});
	});
});

describe('matchesKind', () => {
	it.each([
		['all', click(0), true],
		['actions', click(0), true],
		['actions', request(0, 1), false],
		['requests', request(0, 1), true],
		['errors', error(0), true],
		['vitals', vital(0), true],
		['views', click(0), false],
	] as const)('%s keeps %j: %s', (kind, event, kept) => {
		expect(matchesKind(event, kind)).toBe(kept);
	});
});

describe('viewStrip', () => {
	it('places views, actions and errors along the session', () => {
		const strip = viewStrip(session());
		expect(strip.segments).toStrictEqual([
			{ spanId: 'v1', route: '/', startMs: 0, left: 0, width: 40 },
			{ spanId: 'v2', route: '/cart', startMs: 4000, left: 40, width: 60 },
		]);
		expect(strip.actions).toStrictEqual([39, 40]);
		expect(strip.errors).toStrictEqual([
			{ left: 56, title: '0:05.6 HttpError: POST /api/cart returned 502' },
		]);
	});

	it('stays inside the strip when a view outlasts the session', () => {
		const strip = viewStrip(session({ durationMs: 5000 }));
		expect(strip.segments[1]).toMatchObject({ left: 80, width: 20 });
	});
});

describe('requestBars', () => {
	it('offsets requests from the view start', () => {
		const view = session().timeline?.[1];
		expect(view && requestBars(view)).toStrictEqual([
			{
				spanId: 'span-5000',
				label: 'GET /api/items',
				left: 1000 / 60,
				width: 500 / 60,
				durationMs: 500,
				failed: true,
				slow: false,
			},
		]);
	});
});

describe('viewSummary', () => {
	it('counts what happened on a view', () => {
		const view = session().timeline?.[0];
		expect(view && viewSummary(view)).toStrictEqual({
			requests: 1,
			actions: 1,
			errors: 0,
			lcp: { value: 1820, rating: 'good' },
		});
	});
});

describe('defaultExpanded', () => {
	it('opens views with an error', () => {
		expect([...defaultExpanded(session())]).toStrictEqual(['v2']);
	});

	it('opens the first view otherwise', () => {
		const s = session();
		s.timeline =
			s.timeline?.map((view) => ({
				...view,
				events: (view.events ?? []).filter((event) => event.kind !== 'error'),
			})) ?? null;
		expect([...defaultExpanded(s)]).toStrictEqual(['v1']);
	});
});

describe('sessionFilter', () => {
	const APP = "fusescope.rum.application.id = 'app-1'";

	it('narrows the application to the session', () => {
		expect(sessionFilter('app-1', 's1')).toBe(`${APP} AND session.id = 's1'`);
	});

	it('narrows to one of its errors', () => {
		expect(sessionFilter('app-1', 's1', error(0).error)).toBe(
			`${APP} AND session.id = 's1' AND attribute.event.name = 'exception' AND exception.type = 'HttpError' AND exception.message = 'POST /api/cart returned 502'`,
		);
	});
});

describe('describeEvent', () => {
	it.each([
		[
			request(0, 120),
			{
				label: 'Request',
				title: 'GET /api/items',
				detail: 'backend catalog',
				tone: 'neutral',
			},
		],
		[
			request(0, 120, { failed: true, hasBackend: false, backendService: '' }),
			{
				label: 'Request',
				title: 'GET /api/items',
				detail: 'no backend spans in the trace',
				tone: 'error',
			},
		],
		[click(0), { label: 'Click', title: 'a.link', detail: '', tone: 'action' }],
		[
			{
				...click(0),
				kind: 'action',
				action: { type: 'custom', name: 'add_to_cart', target: '' },
			},
			{
				label: 'Action',
				title: 'add_to_cart',
				detail: 'custom action',
				tone: 'action',
			},
		],
		[
			error(0),
			{
				label: 'Error',
				title: 'HttpError: POST /api/cart returned 502',
				detail: 'unhandledrejection',
				tone: 'error',
			},
		],
		[
			vital(0),
			{ label: 'Vital', title: 'LCP 1.82 s', detail: 'Good', tone: 'success' },
		],
	] as const)('%#', (event, description) => {
		expect(
			describeEvent(event as Parameters<typeof describeEvent>[0]),
		).toStrictEqual(description);
	});
});
