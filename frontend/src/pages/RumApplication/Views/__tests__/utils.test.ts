import {
	RumtypesViewRouteDTO,
	RumtypesVitalNameDTO,
} from 'api/generated/services/fuseScope.schemas';

import {
	chartMax,
	clientShares,
	releaseMarkers,
	requestLabel,
	sortViewRows,
	toViewRows,
	unknownLoadsTotal,
	vitalPoints,
} from '../utils';

function route(
	name: string,
	overrides: Partial<RumtypesViewRouteDTO> = {},
): RumtypesViewRouteDTO {
	return {
		route: name,
		views: 10,
		pageLoads: 4,
		routeChanges: 6,
		unknownLoads: 0,
		medianTimeOnViewMs: 1000,
		errors: 0,
		lcp: null,
		inp: null,
		cls: null,
		slowestRequest: null,
		...overrides,
	};
}

const lcp = (p75: number): RumtypesViewRouteDTO['lcp'] => ({
	name: RumtypesVitalNameDTO.lcp,
	samples: 3,
	p75,
	good: 1,
	needsImprovement: 1,
	poor: 1,
});

describe('toViewRows', () => {
	it('flattens vitals and the slowest request', () => {
		const [row] = toViewRows([
			route('/product/:id', {
				lcp: lcp(3420),
				slowestRequest: {
					method: 'GET',
					host: 'api.example.com',
					path: '/api/products/:id',
					p75Ms: 1240,
					calls: 12,
				},
			}),
		]);
		expect(row.lcp).toStrictEqual({
			p75: 3420,
			samples: 3,
			counts: { good: 1, needsImprovement: 1, poor: 1 },
		});
		expect(row.inp).toBeUndefined();
		expect(row.slowest).toStrictEqual({
			label: 'GET /api/products/:id',
			host: 'api.example.com',
			p75Ms: 1240,
		});
	});

	it('reads a missing list as no routes', () => {
		expect(toViewRows(null)).toStrictEqual([]);
	});
});

describe('sortViewRows', () => {
	const rows = toViewRows([
		route('/a', { lcp: lcp(1000), errors: 5 }),
		route('/b', { errors: 9 }),
		route('/c', { lcp: lcp(4000), errors: 1 }),
	]);
	const order = (key: Parameters<typeof sortViewRows>[1]): string[] =>
		sortViewRows(rows, key).map((row) => row.route);

	it.each([
		[{ key: 'lcp', direction: 'desc' }, ['/c', '/a', '/b']],
		[{ key: 'lcp', direction: 'asc' }, ['/a', '/c', '/b']],
		[{ key: 'errors', direction: 'desc' }, ['/b', '/a', '/c']],
		[{ key: 'route', direction: 'asc' }, ['/a', '/b', '/c']],
	] as const)('%j', (sort, expected) => {
		expect(order(sort)).toStrictEqual(expected);
	});
});

describe('unknownLoadsTotal', () => {
	it('sums views without a loading type', () => {
		expect(
			unknownLoadsTotal(
				toViewRows([
					route('/a', { unknownLoads: 3 }),
					route('/b', { unknownLoads: 2 }),
				]),
			),
		).toBe(5);
	});
});

describe('requestLabel', () => {
	it('names a request by method and template', () => {
		expect(requestLabel({ method: 'POST', path: '/api/cart' })).toBe(
			'POST /api/cart',
		);
	});
});

describe('clientShares', () => {
	it('shares page loads', () => {
		expect(
			clientShares([
				{ name: 'Chrome 130', views: 10, pageLoads: 3, lcpP75Ms: 2100 },
				{ name: 'Safari 18', views: 10, pageLoads: 1, lcpP75Ms: null },
			]),
		).toStrictEqual({
			basis: 'pageLoads',
			rows: [
				{ name: 'Chrome 130', share: 75, lcpP75Ms: 2100 },
				{ name: 'Safari 18', share: 25, lcpP75Ms: undefined },
			],
		});
	});

	it('falls back to views without page loads', () => {
		expect(
			clientShares([
				{ name: 'Chrome 130', views: 1, pageLoads: 0, lcpP75Ms: null },
				{ name: 'Firefox 131', views: 3, pageLoads: 0, lcpP75Ms: null },
			]),
		).toStrictEqual({
			basis: 'views',
			rows: [
				{ name: 'Firefox 131', share: 75, lcpP75Ms: undefined },
				{ name: 'Chrome 130', share: 25, lcpP75Ms: undefined },
			],
		});
	});
});

describe('vitalPoints', () => {
	it('picks one vital, oldest first', () => {
		expect(
			vitalPoints(
				{
					stepSeconds: 3600,
					vitals: [
						{
							name: RumtypesVitalNameDTO.lcp,
							points: [
								{ timestamp: '2026-10-22T13:00:00Z', p75: 2000, samples: 2 },
								{ timestamp: '2026-10-22T12:00:00Z', p75: 1800, samples: 1 },
							],
						},
					],
				},
				'lcp',
			),
		).toStrictEqual([
			{ at: Date.parse('2026-10-22T12:00:00Z'), p75: 1800 },
			{ at: Date.parse('2026-10-22T13:00:00Z'), p75: 2000 },
		]);
	});

	it('is empty for a vital without samples', () => {
		expect(vitalPoints({ stepSeconds: 60, vitals: null }, 'inp')).toStrictEqual(
			[],
		);
	});
});

describe('releaseMarkers', () => {
	it('keeps releases first seen in the window', () => {
		const start = Date.parse('2026-10-22T00:00:00Z');
		const end = Date.parse('2026-10-23T00:00:00Z');
		expect(
			releaseMarkers(
				[
					{ release: '1.7.4', firstSeenAt: '2026-10-01T00:00:00Z' },
					{ release: '1.8.0', firstSeenAt: '2026-10-22T09:05:00Z' },
				],
				start,
				end,
			),
		).toStrictEqual([
			{ release: '1.8.0', at: Date.parse('2026-10-22T09:05:00Z') },
		]);
	});
});

describe('chartMax', () => {
	it('leaves room above the poor threshold', () => {
		expect(chartMax([{ at: 0, p75: 1000 }], 'lcp')).toBe(5000);
	});

	it('leaves room above the highest point', () => {
		expect(chartMax([{ at: 0, p75: 8000 }], 'lcp')).toBe(8800);
	});
});
