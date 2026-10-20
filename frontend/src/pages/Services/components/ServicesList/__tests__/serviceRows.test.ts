import { ServiceApm } from 'lib/apm/servicesList';

import { buildServiceRows, compareFlagged } from '../serviceRows';
import { services } from './servicesMock';

const apm = (overrides: Partial<ServiceApm['current']>): ServiceApm => ({
	current: { requests: 100, rate: 1, errorRate: 0, p99: 100, ...overrides },
	previous: { requests: 100, rate: 1, errorRate: 0, p99: 100 },
	sparks: { rate: [], errorRate: [], p99: [] },
});

describe('buildServiceRows', () => {
	it('reads trace p99 in ms and keeps the list values', () => {
		const [frontend] = buildServiceRows(services, {}, false);
		expect(frontend).toStrictEqual(
			expect.objectContaining({
				serviceName: 'frontend',
				p99: 1261.49814,
				errorRate: 0,
				callRate: services[0].callRate,
				numCalls: 255,
				badges: [],
				flag: 0,
			}),
		);
	});

	it('keeps span-metrics p99, already in ms, and takes requests from the totals', () => {
		const [row] = buildServiceRows(
			[{ ...services[0], p99: 612.5, numCalls: 0 }],
			{ frontend: apm({ requests: 4200 }) },
			true,
		);
		expect(row.p99).toBe(612.5);
		expect(row.numCalls).toBe(4200);
	});

	it('flags a service from its period comparison', () => {
		const [row] = buildServiceRows(
			[{ ...services[0], errorRate: 100 }],
			{ frontend: apm({ errorRate: 100, p99: 300 }) },
			false,
		);
		expect(row.badges.map((badge) => badge.text)).toStrictEqual([
			'100% errors',
			'p99 ↑3×',
		]);
		expect(row.flag).toBe(2100);
	});
});

describe('compareFlagged', () => {
	it('puts flagged services first, then higher error rates, then slower p99', () => {
		const rows = buildServiceRows(
			[
				{ ...services[0], serviceName: 'calm', errorRate: 0, p99: 1e6 },
				{ ...services[0], serviceName: 'slow', errorRate: 0, p99: 9e8 },
				{ ...services[0], serviceName: 'failing', errorRate: 2, p99: 1e6 },
				{ ...services[0], serviceName: 'flagged', errorRate: 0, p99: 1e6 },
			],
			{ flagged: apm({ p99: 500 }) },
			false,
		);
		expect(
			[...rows].sort(compareFlagged).map((row) => row.serviceName),
		).toStrictEqual(['flagged', 'failing', 'slow', 'calm']);
	});
});
