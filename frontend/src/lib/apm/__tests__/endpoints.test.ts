import { endpointRows, NOT_SET } from '../endpoints';

const window = { start: 0, end: 3_600_000, seconds: 3600, step: 60 };

describe('endpointRows', () => {
	it('adds rate, average and time share to the top operations', () => {
		const rows = endpointRows({
			window,
			operations: [
				{
					name: 'HTTP GET /dispatch',
					p50: 650,
					p95: 980,
					p99: 1120,
					numCalls: 3600,
					errorCount: 36,
				},
				{
					name: 'HTTP GET /route',
					p50: 51,
					p95: 86,
					p99: 118,
					numCalls: 36000,
					errorCount: 0,
				},
			],
			totals: {
				'HTTP GET /dispatch': { requests: 3600, durationMs: 3600 * 700 },
				'HTTP GET /route': { requests: 36000, durationMs: 36000 * 50 },
			},
			sparks: {},
		});
		expect(rows[0]).toStrictEqual(
			expect.objectContaining({
				name: 'HTTP GET /dispatch',
				notSet: false,
				requests: 3600,
				rate: 1,
				errorRate: 1,
				avg: 700,
				p50: 650,
				p95: 980,
				p99: 1120,
			}),
		);
		expect(rows[0].share).toBeCloseTo((2_520_000 / 4_320_000) * 100, 5);
		expect(rows[1].share).toBeCloseTo((1_800_000 / 4_320_000) * 100, 5);
	});

	it('falls back to percentiles when a series total is missing', () => {
		const [row] = endpointRows({
			window,
			operations: [
				{ name: 'op', p50: 2, p95: 3, p99: 4, numCalls: 10, errorCount: 0 },
			],
			totals: {},
			sparks: {},
		});
		expect(row.avg).toBeUndefined();
		expect(row.share).toBe(0);
	});

	it('names rows without the attribute "(not set)", without percentiles', () => {
		const rows = endpointRows({
			window,
			operations: [
				{ name: '', p50: 2, p95: 3, p99: 4, numCalls: 10, errorCount: 5 },
				{ name: '/dispatch', p50: 2, p95: 3, p99: 4, numCalls: 10, errorCount: 0 },
			],
			totals: {},
			sparks: {},
		});
		expect(rows[0]).toStrictEqual(
			expect.objectContaining({
				name: NOT_SET,
				notSet: true,
				errorRate: 50,
				p50: undefined,
				p95: undefined,
				p99: undefined,
			}),
		);
		expect(rows[1].notSet).toBe(false);
	});
});
