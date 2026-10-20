import { endpointData } from '../endpointData';

const window = { start: 0, end: 3_600_000, seconds: 3600, step: 60 };

const point = (
	timestamp: number,
	value: number,
): { timestamp: number; value: number } => ({
	timestamp,
	value,
});

describe('endpointData', () => {
	it('joins top operations (ns) with the per-name series', () => {
		const series = {
			data: {
				results: [
					{
						queryName: 'A',
						aggregations: [
							[60, 30],
							[60 * 7e8, 30 * 7e8],
							[1.1e9, 1.2e9],
						].map((pair, index) => ({
							index,
							series: [
								{
									labels: [{ key: { name: 'name' }, value: '/dispatch' }],
									values: [point(1, pair[0]), point(2, pair[1])],
								},
							],
						})),
					},
				],
			},
		};
		const [row] = endpointData('traces', 'name', window, {
			series,
			totals: undefined,
			topOperations: [
				{
					name: '/dispatch',
					p50: 6.5e8,
					p95: 9.8e8,
					p99: 1.12e9,
					numCalls: 90,
					errorCount: 9,
				},
			],
		});
		expect(row).toStrictEqual(
			expect.objectContaining({
				name: '/dispatch',
				requests: 90,
				errorRate: 10,
				avg: 700,
				p99: 1120,
				share: 100,
				sparks: { rate: [1, 0.5], p99: [1100, 1200] },
			}),
		);
	});

	it('reads span metrics by operation, already in ms', () => {
		const one = (name: string, value: number): unknown => ({
			queryName: name,
			columns: [
				{ name: 'operation', queryName: name, columnType: 'group' },
				{
					name: '__result_0',
					queryName: name,
					aggregationIndex: 0,
					columnType: 'aggregation',
				},
			],
			data: [['HTTP GET', value]],
		});
		const [row] = endpointData('span-metrics', 'name', window, {
			series: undefined,
			totals: {
				data: {
					results: [
						one('A', 7200),
						one('B', 0),
						one('C', 50),
						one('D', 90),
						one('E', 99),
						one('F', 7200 * 52),
					],
				},
			},
			topOperations: undefined,
		});
		expect(row).toStrictEqual(
			expect.objectContaining({
				name: 'HTTP GET',
				rate: 2,
				avg: 52,
				p50: 50,
				p95: 90,
				p99: 99,
			}),
		);
	});
});
