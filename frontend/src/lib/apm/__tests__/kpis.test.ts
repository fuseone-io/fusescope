import { serviceKpiRequest, serviceKpis } from '../serviceKpis';

const window = { start: 0, end: 3_600_000, seconds: 3600, step: 60 };

type Spec = { name: string; signal: string; filter: { expression: string } };

describe('serviceKpiRequest', () => {
	it('reads the service entry spans from traces, this and the previous period', () => {
		const request = serviceKpiRequest({
			source: 'traces',
			window,
			servicename: 'frontend',
			resourceFilter: '',
			topLevelOperations: [],
			apdexThreshold: 0.5,
		});
		const specs = request.compositeQuery.queries.map(
			(query) => query.spec as Spec,
		);
		expect(specs.map((spec) => [spec.name, spec.signal])).toStrictEqual([
			['A', 'traces'],
			['B', 'traces'],
		]);
		expect(specs[0].filter.expression).toBe(
			"service.name = 'frontend' AND (isRoot = true OR isEntryPoint = true)",
		);
		expect(JSON.stringify(specs[0])).toContain(
			'countIf(duration_nano <= 500000000)',
		);
	});

	it('reads span metrics when use_span_metrics is on', () => {
		const request = serviceKpiRequest({
			source: 'span-metrics',
			window,
			servicename: 'frontend',
			resourceFilter: '',
			topLevelOperations: ['HTTP GET /dispatch'],
			apdexThreshold: 0.5,
		});
		const specs = request.compositeQuery.queries.map(
			(query) => query.spec as Spec,
		);
		expect(specs.every((spec) => spec.signal === 'metrics')).toBe(true);
		expect(specs[0].filter.expression).toBe(
			"service.name = 'frontend' AND operation IN ['HTTP GET /dispatch']",
		);
	});
});

const scalar = (
	name: string,
	values: (number | string)[],
	groups: string[] = [],
): unknown => ({
	queryName: name,
	columns: [
		...groups.map(() => ({ name: 'le', queryName: name, columnType: 'group' })),
		...values.slice(groups.length).map((_, index) => ({
			name: `__result_${index}`,
			queryName: name,
			aggregationIndex: index,
			columnType: 'aggregation',
		})),
	],
	data: [values],
});

describe('serviceKpis', () => {
	it('reads trace totals as KPIs with Apdex', () => {
		const kpis = serviceKpis('traces', window, {
			data: {
				results: [
					scalar('A', [3600, 36, 1.12e9, 4.02e8, 1800, 1200]),
					scalar('B', [1800, 9, 5.4e8, 2.91e8, 1500, 300]),
				],
			},
		});
		expect(kpis.current).toStrictEqual({
			requests: 3600,
			rate: 1,
			errors: 36,
			errorRate: 1,
			p99: 1120,
			avg: 402,
			apdex: (1800 + 600) / 3600,
		});
		expect(kpis.previous?.apdex).toBeCloseTo((1500 + 150) / 1800, 5);
	});

	it('reads span metric totals, with Apdex from the latency buckets', () => {
		const one = (name: string, value: number): unknown => scalar(name, [value]);
		const buckets = (name: string): unknown => ({
			queryName: name,
			columns: [
				{ name: 'le', queryName: name, columnType: 'group' },
				{
					name: '__result_0',
					queryName: name,
					aggregationIndex: 0,
					columnType: 'aggregation',
				},
			],
			data: [
				['250', 50],
				['500', 60],
				['2000', 90],
				['+Inf', 100],
			],
		});
		const kpis = serviceKpis(
			'span-metrics',
			window,
			{
				data: {
					results: [
						one('A', 100),
						one('B', 5),
						one('C', 900),
						one('D', 40000),
						one('E', 100),
						buckets('F'),
					],
				},
			},
			0.5,
		);
		expect(kpis.current).toStrictEqual({
			requests: 100,
			rate: 100 / 3600,
			errors: 5,
			errorRate: 5,
			p99: 900,
			avg: 400,
			apdex: (60 + 30 / 2) / 100,
		});
		expect(kpis.previous).toBeUndefined();
	});
});
