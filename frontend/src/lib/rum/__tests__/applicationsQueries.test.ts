import { RangeResponse } from 'lib/apm/queryRange';

import {
	applicationsMetrics,
	applicationsRequests,
} from '../applicationsQueries';
import { scalarResult as scalar } from './fixtures';

const APP = 'fusescope.rum.application.id';

const TOTALS: RangeResponse = {
	data: {
		results: [
			scalar('S', [APP], 3, [
				['a', 200, 900, '2026-10-21T10:00:00Z'],
				['b', 10, 12, '2026-10-21T09:00:00Z'],
			]),
			scalar('SP', [APP], 1, [['a', 100]]),
			scalar('E', [APP], 1, [['a', 4]]),
			scalar('EP', [APP], 1, [['a', 1]]),
			scalar('V', [APP, 'browser.web_vital.name'], 4, [
				['a', 'lcp', 2140, 78, 15, 7],
				['a', 'cls', 0.04, 91, 6, 3],
				['a', 'unknown', 1, 1, 0, 0],
			]),
			scalar('K', [APP, 'telemetry.distro.name', 'telemetry.distro.version'], 1, [
				['a', '@fusescope/browser', '0.1.0', 1792600000000000000],
				['a', '@fusescope/browser', '0.2.0', 1792630000000000000],
			]),
		],
	},
};

const SERIES: RangeResponse = {
	data: {
		results: [
			{
				queryName: 'A',
				aggregations: [
					{
						index: 0,
						series: [
							{
								labels: [{ key: { name: APP }, value: 'a' }],
								values: [
									{ timestamp: 2, value: 5 },
									{ timestamp: 1, value: 3 },
								],
							},
						],
					},
				],
			},
		],
	},
};

describe('applicationsMetrics', () => {
	const metrics = applicationsMetrics(['a', 'b', 'c'], TOTALS, SERIES);

	it('computes the session error rate now and a period back', () => {
		expect(metrics.a.current).toStrictEqual({
			sessions: 200,
			sessionsWithErrors: 4,
			errorRate: 2,
		});
		expect(metrics.a.previous).toStrictEqual({
			sessions: 100,
			sessionsWithErrors: 1,
			errorRate: 1,
		});
	});

	it('reads vitals by name and drops unknown ones', () => {
		expect(metrics.a.vitals.lcp).toStrictEqual({
			p75: 2140,
			samples: 100,
			counts: { good: 78, needsImprovement: 15, poor: 7 },
		});
		expect(Object.keys(metrics.a.vitals)).toStrictEqual(['lcp', 'cls']);
	});

	it('keeps the latest SDK, last seen and activity in time order', () => {
		expect(metrics.a.sdk).toStrictEqual({
			name: '@fusescope/browser',
			version: '0.2.0',
		});
		expect(metrics.a.lastSeen).toBe(Date.parse('2026-10-21T10:00:00Z'));
		expect(metrics.a.activity).toStrictEqual([3, 5]);
		expect(metrics.a.views).toBe(900);
	});

	it('has no error rate or history for an application without errors or a previous period', () => {
		expect(metrics.b.current.errorRate).toBe(0);
		expect(metrics.b.previous).toBeUndefined();
		expect(metrics.c.current.errorRate).toBeUndefined();
		expect(metrics.c.sdk).toBeUndefined();
	});
});

describe('applicationsRequests', () => {
	it('scopes every query to the applications', () => {
		const { totals } = applicationsRequests(
			{ start: 0, end: 3_600_000, seconds: 3600, step: 120 },
			['a', 'b'],
		);
		const filters = totals.compositeQuery.queries.map(
			(query) =>
				(query.spec as { filter: { expression: string } }).filter.expression,
		);
		filters.forEach((filter) =>
			expect(filter).toContain("fusescope.rum.application.id IN ['a', 'b']"),
		);
		expect(filters[2]).toContain("attribute.event.name = 'exception'");
	});
});
