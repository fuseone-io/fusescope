import { serviceKpiRequest, serviceKpis } from '../serviceKpis';

const window = { start: 0, end: 3_600_000, seconds: 3600, step: 60 };

type Spec = {
	name: string;
	signal: string;
	filter: { expression: string };
	aggregations: { expression: string }[];
	functions?: unknown[];
};

describe('serviceKpiRequest', () => {
	const tracesRequest = (topLevelOperations: string[]): Spec[] =>
		serviceKpiRequest({
			source: 'traces',
			window,
			servicename: 'frontend',
			resourceFilter: "deployment.environment = 'prod'",
			topLevelOperations,
			apdexThreshold: 0.5,
		}).compositeQuery.queries.map((query) => query.spec as Spec);

	it('reads the service entry spans from traces, this and the previous period', () => {
		const specs = tracesRequest([]);
		expect(specs.map((spec) => [spec.name, spec.signal])).toStrictEqual([
			['A', 'traces'],
			['B', 'traces'],
		]);
		expect(specs[0].filter.expression).toBe(
			"service.name = 'frontend' AND (isRoot = true OR isEntryPoint = true) AND deployment.environment = 'prod'",
		);
	});

	it('reads Apdex from the top-level operations like the chart, failed requests frustrated', () => {
		const specs = tracesRequest(['HTTP GET /dispatch']);
		expect(specs.map((spec) => spec.name)).toStrictEqual(['A', 'B', 'C', 'D']);
		expect(specs[2].filter.expression).toBe(
			"service.name = 'frontend' AND name IN ['HTTP GET /dispatch'] AND deployment.environment = 'prod'",
		);
		expect(specs[2].aggregations.map((item) => item.expression)).toStrictEqual([
			'count()',
			'countIf(has_error = false AND duration_nano <= 500000000)',
			'countIf(has_error = false AND duration_nano <= 2000000000)',
		]);
		expect(specs[3].functions).toStrictEqual([
			{ name: 'timeShift', args: [{ value: 3600 }] },
		]);
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
		const buckets = specs.filter(
			(spec) => spec.name === 'F' || spec.name === 'L',
		);
		expect(buckets.map((spec) => spec.filter.expression)).toStrictEqual([
			"service.name = 'frontend' AND operation IN ['HTTP GET /dispatch'] AND status.code != 'STATUS_CODE_ERROR'",
			"service.name = 'frontend' AND operation IN ['HTTP GET /dispatch'] AND status.code != 'STATUS_CODE_ERROR'",
		]);
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
	it('reads trace totals as KPIs, with Apdex from its own query', () => {
		const kpis = serviceKpis('traces', window, {
			data: {
				results: [
					scalar('A', [3600, 36, 1.12e9, 4.02e8]),
					scalar('B', [1800, 9, 5.4e8, 2.91e8]),
					scalar('C', [3600, 1800, 3000]),
					scalar('D', [1800, 1500, 1800]),
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
			apdex: (1800 + 1200 / 2) / 3600,
		});
		expect(kpis.previous?.apdex).toBeCloseTo((1500 + 300 / 2) / 1800, 5);
	});

	it.each([
		// [case, count(), ok within T, ok within 4T, Apdex]
		['all fast and OK', 100, 100, 100, 1],
		['all failed, however fast', 100, 0, 0, 0],
		['all OK but slower than 4T', 100, 0, 0, 0],
		['mixed: 50 fast, 20 tolerating, 30 failed', 100, 50, 70, 0.6],
	])(
		'scores Apdex from traces: %s',
		(_, total, satisfied, withinFourT, apdex) => {
			const kpis = serviceKpis('traces', window, {
				data: {
					results: [
						scalar('A', [total, 0, 0, 0]),
						scalar('C', [total, satisfied, withinFourT]),
					],
				},
			});
			expect(kpis.current?.apdex).toBeCloseTo(apdex, 5);
		},
	);

	it('has no trace Apdex without its query', () => {
		const kpis = serviceKpis('traces', window, {
			data: { results: [scalar('A', [10, 0, 0, 0])] },
		});
		expect(kpis.current?.apdex).toBeUndefined();
	});

	const okBuckets = (name: string, counts: [string, number][]): unknown => ({
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
		data: counts,
	});
	const one = (name: string, value: number): unknown => scalar(name, [value]);

	it('reads span metric totals, with Apdex from the latency buckets of OK calls', () => {
		const kpis = serviceKpis(
			'span-metrics',
			window,
			{
				data: {
					results: [
						one('A', 100),
						one('B', 20),
						one('C', 900),
						one('D', 40000),
						one('E', 100),
						okBuckets('F', [
							['250', 40],
							['500', 50],
							['2000', 75],
							['+Inf', 80],
						]),
					],
				},
			},
			0.5,
		);
		expect(kpis.current).toStrictEqual({
			requests: 100,
			rate: 100 / 3600,
			errors: 20,
			errorRate: 20,
			p99: 900,
			avg: 400,
			apdex: (50 + 25 / 2) / 100,
		});
		expect(kpis.previous).toBeUndefined();
	});

	it.each([
		// [case, T in s, OK calls by le, all calls, Apdex]
		[
			'all fast and OK',
			0.5,
			[
				['500', 100],
				['+Inf', 100],
			],
			100,
			1,
		],
		[
			'all failed, however fast',
			0.5,
			[
				['500', 0],
				['+Inf', 0],
			],
			100,
			0,
		],
		[
			'mixed: 50 fast, 20 tolerating, 30 failed',
			0.5,
			[
				['500', 50],
				['2000', 70],
				['+Inf', 70],
			],
			100,
			0.6,
		],
		[
			'T between bounds reads the next bound up, like the chart',
			0.3,
			[
				['250', 10],
				['500', 50],
				['1000', 60],
				['2500', 70],
				['+Inf', 70],
			],
			100,
			(50 + 70) / 2 / 100,
		],
	] as [string, number, [string, number][], number, number][])(
		'scores Apdex from span metrics: %s',
		(_, threshold, counts, total, apdex) => {
			const kpis = serviceKpis(
				'span-metrics',
				window,
				{
					data: {
						results: [one('A', total), one('E', total), okBuckets('F', counts)],
					},
				},
				threshold,
			);
			expect(kpis.current?.apdex).toBeCloseTo(apdex, 5);
		},
	);
});
