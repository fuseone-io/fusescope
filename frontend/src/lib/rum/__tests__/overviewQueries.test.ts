import { RangeResponse } from 'lib/apm/queryRange';

import {
	applicationOverview,
	overviewFilter,
	topRoutes,
} from '../overviewQueries';
import { pickSessionRequests, sessionErrorCounts } from '../sessionRequests';
import { scalarResult as scalar } from './fixtures';

const ROUTE = 'fusescope.rum.view.route';
const VITAL = 'browser.web_vital.name';

const RESPONSE: RangeResponse = {
	data: {
		results: [
			scalar('S', [], 2, [[50, 220]]),
			scalar('SP', [], 1, [[40]]),
			scalar('E', [], 1, [[5]]),
			scalar('EP', [], 1, [[2]]),
			scalar('V', [VITAL], 4, [['lcp', 2140, 8, 1, 1]]),
			scalar('R', [ROUTE, VITAL], 4, [
				['/', 'lcp', 1200, 10, 0, 0],
				['/product/:id', 'lcp', 4300, 2, 3, 5],
				['/product/:id', 'inp', 240, 5, 4, 1],
				['/search', 'cls', 0.3, 0, 0, 2],
			]),
			scalar('RE', [ROUTE], 1, [['/product/:id', 7]]),
			scalar('ER', ['exception.type', 'exception.message', ROUTE], 3, [
				['TypeError', 'x is undefined', '/product/:id', 6, 4, 1792630000000000000],
				['RangeError', 'too deep', '/', 1, 1, 1792640000000000000],
			]),
			scalar('SS', ['session.id', 'user_agent.original', 'service.version'], 3, [
				['s1', 'ua', '1.0.0', '2026-10-21T10:00:00Z', '2026-10-21T10:02:00Z', 3],
				['s2', 'ua', '1.0.0', '2026-10-21T11:00:00Z', '2026-10-21T11:00:30Z', 1],
			]),
			scalar('RL', ['service.version'], 1, [
				['1.0.0', 5],
				['1.1.0', 3],
			]),
		],
	},
};

describe('applicationOverview', () => {
	const overview = applicationOverview(RESPONSE, 'a');

	it('computes the session error rate now and a period back', () => {
		expect(overview.current.errorRate).toBe(10);
		expect(overview.previous?.errorRate).toBe(5);
		expect(overview.views).toBe(220);
	});

	it('ranks routes by LCP p75 with their errors, page loads and INP', () => {
		expect(overview.routes.map((route) => route.route)).toStrictEqual([
			'/product/:id',
			'/',
			'/search',
		]);
		expect(overview.routes[0]).toMatchObject({
			loads: 10,
			inp: 240,
			errors: 7,
		});
		expect(overview.routes[2]).toMatchObject({ loads: 0, cls: 0.3, errors: 0 });
		expect(overview.routeCount).toBe(3);
	});

	it('lists errors newest first and sessions by start', () => {
		expect(overview.errors.map((error) => error.type)).toStrictEqual([
			'RangeError',
			'TypeError',
		]);
		expect(overview.sessions.map((session) => session.id)).toStrictEqual([
			's2',
			's1',
		]);
		expect(overview.sessions[1].durationMs).toBe(120_000);
	});

	it('lists releases newest first', () => {
		expect(overview.releases).toStrictEqual(['1.1.0', '1.0.0']);
	});

	it('is empty without a response', () => {
		const empty = applicationOverview(undefined, 'a');
		expect(empty.current.errorRate).toBeUndefined();
		expect(empty.routes).toStrictEqual([]);
	});
});

describe('topRoutes', () => {
	it('keeps the seven slowest', () => {
		const routes = Array.from({ length: 9 }, (_, index) => ({
			route: `/r${index}`,
			loads: 1,
			lcp: {
				p75: index * 100,
				samples: 1,
				counts: { good: 1, needsImprovement: 0, poor: 0 },
			},
			errors: 0,
		}));
		expect(topRoutes(routes).map((route) => route.route)).toStrictEqual([
			'/r8',
			'/r7',
			'/r6',
			'/r5',
			'/r4',
			'/r3',
			'/r2',
		]);
	});
});

describe('overviewFilter', () => {
	it('adds the release when one is picked', () => {
		expect(overviewFilter('a', '')).toBe("fusescope.rum.application.id = 'a'");
		expect(overviewFilter('a', '1.0.0')).toBe(
			"fusescope.rum.application.id = 'a' AND service.version = '1.0.0'",
		);
	});
});

describe('session requests', () => {
	const row = (data: Record<string, unknown>): unknown => ({ data });

	it('picks the failing request of a session, else its slowest', () => {
		const picked = pickSessionRequests({
			data: {
				results: [
					{
						queryName: 'RQ',
						rows: [
							row({
								'session.id': 's1',
								trace_id: 't1',
								span_id: 'a',
								duration_nano: 9e8,
								'http.request.method': 'GET',
								'url.full': 'http://x/api/slow?q=1',
								'http.response.status_code': '200',
								has_error: false,
							}),
							row({
								'session.id': 's1',
								trace_id: 't2',
								span_id: 'b',
								duration_nano: 1e8,
								'http.request.method': 'POST',
								'url.full': 'http://x/api/cart',
								'http.response.status_code': '502',
								has_error: true,
							}),
							row({
								'session.id': 's2',
								trace_id: 't3',
								span_id: 'c',
								duration_nano: 3e8,
								'http.request.method': 'GET',
								'url.full': 'http://x/api/a',
								'http.response.status_code': '200',
								has_error: false,
							}),
							row({
								'session.id': 's2',
								trace_id: 't4',
								span_id: 'd',
								duration_nano: 5e8,
								'http.request.method': 'GET',
								'url.full': 'http://x/api/b',
								'http.response.status_code': '200',
								has_error: false,
							}),
						],
					},
				],
			},
		});
		expect(picked.s1).toMatchObject({
			traceId: 't2',
			label: 'POST /api/cart 502',
			failed: true,
		});
		expect(picked.s2).toMatchObject({
			traceId: 't4',
			durationMs: 500,
			failed: false,
		});
	});

	it('counts errors per session', () => {
		expect(
			sessionErrorCounts({
				data: { results: [scalar('SE', ['session.id'], 1, [['s1', 2]])] },
			}),
		).toStrictEqual({ s1: 2 });
	});
});
