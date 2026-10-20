import { apmSourceOf } from '../source';
import { servicesListRequests, servicesListStats } from '../servicesList';

const window = { start: 0, end: 3_600_000, seconds: 3600, step: 120 };

type Spec = { name: string; signal: string; filter: { expression: string } };
const specs = (request: {
	compositeQuery: { queries: { spec: unknown }[] };
}): Spec[] => request.compositeQuery.queries.map((query) => query.spec as Spec);

describe('apmSourceOf', () => {
	it('reads span metrics only when use_span_metrics is active', () => {
		expect(apmSourceOf([{ name: 'use_span_metrics', active: true }])).toBe(
			'span-metrics',
		);
		expect(apmSourceOf([{ name: 'use_span_metrics', active: false }])).toBe(
			'traces',
		);
		expect(apmSourceOf(null)).toBe('traces');
	});
});

describe('servicesListRequests', () => {
	it('reads entry spans from traces, with the previous period shifted back', () => {
		const { totals, series } = servicesListRequests({
			source: 'traces',
			window,
			resourceFilter: "deployment.environment in ['dev']",
			topLevelOperations: [],
		});
		expect(totals.requestType).toBe('scalar');
		expect(specs(totals).map((spec) => [spec.name, spec.signal])).toStrictEqual([
			['A', 'traces'],
			['B', 'traces'],
		]);
		expect(specs(totals)[0].filter.expression).toBe(
			"(isRoot = true OR isEntryPoint = true) AND deployment.environment in ['dev']",
		);
		expect(totals.compositeQuery.queries[1].spec).toStrictEqual(
			expect.objectContaining({
				functions: [{ name: 'timeShift', args: [{ value: 3600 }] }],
			}),
		);
		expect(series.requestType).toBe('time_series');
		expect(specs(series)[0]).toStrictEqual(
			expect.objectContaining({ name: 'A', stepInterval: 120 }),
		);
	});

	it("reads span metrics scoped to each service's top-level operations", () => {
		const { totals, series } = servicesListRequests({
			source: 'span-metrics',
			window,
			resourceFilter: '',
			topLevelOperations: [['route', ['HTTP GET /route']]],
		});
		expect(specs(totals).every((spec) => spec.signal === 'metrics')).toBe(true);
		expect(specs(totals)).toHaveLength(10);
		expect(specs(totals)[0].filter.expression).toBe(
			"(service.name = 'route' AND operation IN ['HTTP GET /route'])",
		);
		expect(specs(totals)[1].filter.expression).toBe(
			"(service.name = 'route' AND operation IN ['HTTP GET /route']) AND status.code = 'STATUS_CODE_ERROR'",
		);
		expect(specs(series)).toHaveLength(3);
	});
});

const scalarResult = (
	queryName: string,
	rows: (string | number)[][],
	aggregations: number,
): unknown => ({
	queryName,
	columns: [
		{ name: 'service.name', queryName, aggregationIndex: 0, columnType: 'group' },
		...Array.from({ length: aggregations }, (_, index) => ({
			name: `__result_${index}`,
			queryName,
			aggregationIndex: index,
			columnType: 'aggregation',
		})),
	],
	data: rows,
});

describe('servicesListStats', () => {
	it('turns trace totals into per-service stats in ms and per second', () => {
		const totals = {
			data: {
				results: [
					scalarResult('A', [['payment', 3600, 3600, 2e7, 3e7, 5e8]], 5),
					scalarResult('B', [['payment', 1800, 1800, 2e7, 3e7, 2.5e8]], 5),
				],
			},
		};
		const series = {
			data: {
				results: [
					{
						queryName: 'A',
						aggregations: [0, 1, 2].map((index) => ({
							index,
							series: [
								{
									labels: [{ key: { name: 'service.name' }, value: 'payment' }],
									values: [
										{ timestamp: 1, value: [240, 120, 4e8][index] },
										{ timestamp: 2, value: [120, 0, 6e8][index] },
									],
								},
							],
						})),
					},
				],
			},
		};
		const stats = servicesListStats('traces', window, totals, series);
		expect(stats.payment.current).toStrictEqual({
			requests: 3600,
			rate: 1,
			errors: 3600,
			errorRate: 100,
			p50: 20,
			p95: 30,
			p99: 500,
		});
		expect(stats.payment.previous?.p99).toBe(250);
		expect(stats.payment.previous?.rate).toBe(0.5);
		expect(stats.payment.sparks).toStrictEqual({
			rate: [2, 1],
			errorRate: [50, 0],
			p99: [400, 600],
		});
	});

	it('reads span metric totals, already in ms', () => {
		const one = (name: string, value: number): unknown =>
			scalarResult(name, [['route', value]], 1);
		const totals = {
			data: {
				results: [
					one('A', 7200),
					one('B', 72),
					one('C', 51),
					one('D', 86),
					one('E', 118),
					one('F', 3600),
					one('G', 0),
					one('H', 50),
					one('I', 80),
					one('J', 112),
				],
			},
		};
		const stats = servicesListStats('span-metrics', window, totals, undefined);
		expect(stats.route.current).toStrictEqual({
			requests: 7200,
			rate: 2,
			errors: 72,
			errorRate: 1,
			p50: 51,
			p95: 86,
			p99: 118,
		});
		expect(stats.route.previous?.errorRate).toBe(0);
		expect(stats.route.sparks).toStrictEqual({
			rate: [],
			errorRate: [],
			p99: [],
		});
	});
});
