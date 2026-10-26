import { RumtypesPlatformDTO } from 'api/generated/services/fuseScope.schemas';
import { RangeResponse } from 'lib/apm/queryRange';

import {
	applicationOverview,
	overviewFilter,
	overviewRequest,
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
			scalar('SS', ['session.id', 'user_agent.original', 'service.version'], 3, [
				['s1', 'ua', '1.0.0', '2026-10-21T10:00:00Z', '2026-10-21T10:02:00Z', 3],
				['s2', 'ua', '1.0.0', '2026-10-21T11:00:00Z', '2026-10-21T11:00:30Z', 1],
			]),
			scalar('RL', ['service.version'], 1, [
				['1.0.0', 5],
				['1.10.0', 3],
				['1.9.0', 2],
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

	it('counts sessions that only sent logs, so the rate stays below 100%', () => {
		const logsOnly = applicationOverview(
			{
				data: {
					results: [
						scalar('S', [], 2, [[4, 6]]),
						scalar('L', [], 1, [[10]]),
						scalar('E', [], 1, [[8]]),
						scalar('LP', [], 1, [[5]]),
						scalar('EP', [], 1, [[1]]),
					],
				},
			},
			'a',
		);
		expect(logsOnly.current).toStrictEqual({
			sessions: 10,
			sessionsWithErrors: 8,
			errorRate: 80,
		});
		expect(logsOnly.previous?.errorRate).toBe(20);
	});

	it('lists sessions by start', () => {
		expect(overview.sessions.map((session) => session.id)).toStrictEqual([
			's2',
			's1',
		]);
		expect(overview.sessions[1].durationMs).toBe(120_000);
	});

	it('lists releases newest first', () => {
		expect(overview.releases).toStrictEqual(['1.10.0', '1.9.0', '1.0.0']);
	});

	it('is empty without a response', () => {
		const empty = applicationOverview(undefined, 'a');
		expect(empty.current.errorRate).toBeUndefined();
		expect(empty.routes).toStrictEqual([]);
	});
});

describe('Android overview', () => {
	const WINDOW = { start: 0, end: 3_600_000, seconds: 3600, step: 120 };
	const MOBILE = [
		'session.id',
		'user_agent.original',
		'service.version',
		'os.name',
		'os.version',
		'device.manufacturer',
		'device.model.name',
	];
	const queries = (
		platform: RumtypesPlatformDTO,
	): Partial<Record<string, unknown>>[] =>
		overviewRequest(WINDOW, 'a', '', platform).compositeQuery.queries.map(
			(query): Partial<Record<string, unknown>> => ({ ...query.spec }),
		);

	it('asks for app start p75 by start type only for Android', () => {
		const appStart = queries(RumtypesPlatformDTO.android).find(
			(spec) => spec.name === 'AS',
		);
		expect(appStart).toMatchObject({
			signal: 'logs',
			filter: {
				expression:
					"fusescope.rum.application.id = 'a' AND attribute.event.name = 'rum.vital' AND fusescope.rum.vital.name = 'app_start'",
			},
			groupBy: [{ name: 'start.type' }],
			aggregations: [
				{ expression: 'p75(fusescope.rum.vital.value)' },
				{ expression: "countIf(fusescope.rum.vital.rating = 'good')" },
				{ expression: "countIf(fusescope.rum.vital.rating = 'needs-improvement')" },
				{ expression: "countIf(fusescope.rum.vital.rating = 'poor')" },
			],
		});
		expect(
			queries(RumtypesPlatformDTO.web).some((spec) => spec.name === 'AS'),
		).toBe(false);
	});

	it('groups recent Android sessions by device and OS', () => {
		const sessions = queries(RumtypesPlatformDTO.android).find(
			(spec) => spec.name === 'SS',
		);
		expect(sessions?.groupBy).toStrictEqual(MOBILE.map((name) => ({ name })));
		expect(
			queries(RumtypesPlatformDTO.web).find((spec) => spec.name === 'SS')?.groupBy,
		).toStrictEqual(MOBILE.slice(0, 3).map((name) => ({ name })));
	});

	const android = applicationOverview(
		{
			data: {
				results: [
					scalar('AS', ['start.type'], 4, [
						['cold', 2140, 8, 1, 1],
						['warm', 640, 3, 0, 0],
					]),
					scalar('SS', MOBILE, 3, [
						[
							's1',
							'',
							'2.1.0',
							'Android',
							'14',
							'Google',
							'Pixel 8',
							'2026-10-21T10:00:00Z',
							'2026-10-21T10:02:00Z',
							3,
						],
					]),
				],
			},
		},
		'a',
	);

	it('summarizes app start by start type', () => {
		expect(android.appStart).toStrictEqual({
			cold: {
				p75: 2140,
				samples: 10,
				counts: { good: 8, needsImprovement: 1, poor: 1 },
			},
			warm: {
				p75: 640,
				samples: 3,
				counts: { good: 3, needsImprovement: 0, poor: 0 },
			},
		});
	});

	it('labels sessions with the device and OS', () => {
		expect(android.sessions[0].client).toBe('Google Pixel 8 · Android 14');
		expect(applicationOverview(RESPONSE, 'a').sessions[0].client).toBe('Other');
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
