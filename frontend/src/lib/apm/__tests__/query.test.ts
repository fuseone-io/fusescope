import {
	allOf,
	entrySpansFilter,
	quote,
	resourceFilterExpression,
	serviceOperationsFilter,
} from '../filters';
import {
	metricQuery,
	rangeRequest,
	scalarRows,
	seriesOf,
	traceQuery,
} from '../queryRange';
import { apmWindow } from '../window';

describe('filters', () => {
	it('quotes values for filter expressions', () => {
		expect(quote("it's")).toBe("'it\\'s'");
		expect(quote('a\\b')).toBe("'a\\\\b'");
	});

	it('joins clauses with AND, grouping the ones that use OR', () => {
		expect(allOf("service.name = 'a'", '', entrySpansFilter, undefined)).toBe(
			"service.name = 'a' AND (isRoot = true OR isEntryPoint = true)",
		);
		expect(allOf()).toBe('');
	});

	it('turns the resource filter into an expression', () => {
		expect(
			resourceFilterExpression([
				{
					id: '1',
					tagKey: 'resource_deployment.environment',
					operator: 'IN',
					tagValue: ['dev', 'prod'],
				},
			]),
		).toBe("deployment.environment in ['dev', 'prod']");
		expect(resourceFilterExpression([])).toBe('');
	});

	it("scopes span metrics to each service's top-level operations", () => {
		expect(
			serviceOperationsFilter([
				['frontend', ['/dispatch']],
				['route', ['HTTP GET /route', "x'y"]],
			]),
		).toBe(
			"(service.name = 'frontend' AND operation IN ['/dispatch']) OR (service.name = 'route' AND operation IN ['HTTP GET /route', 'x\\'y'])",
		);
	});
});

describe('apmWindow', () => {
	it('converts the global time to ms and picks a step of about 30 points', () => {
		const window = apmWindow(1e18, 1e18 + 3.6e12);
		expect(window).toStrictEqual({
			start: 1_000_000_000_000,
			end: 1_000_003_600_000,
			seconds: 3600,
			step: 120,
		});
	});

	it('never steps below a minute', () => {
		expect(apmWindow(0, 300_000_000_000).step).toBe(60);
	});
});

describe('request builders', () => {
	it('builds a trace query with a previous-period shift', () => {
		expect(
			traceQuery({
				name: 'B',
				filter: "service.name = 'a'",
				groupBy: ['service.name'],
				aggregations: ['count()'],
				shift: 3600,
				step: 60,
			}),
		).toStrictEqual({
			type: 'builder_query',
			spec: {
				name: 'B',
				signal: 'traces',
				stepInterval: 60,
				filter: { expression: "service.name = 'a'" },
				groupBy: [{ name: 'service.name' }],
				aggregations: [{ expression: 'count()' }],
				functions: [{ name: 'timeShift', args: [{ value: 3600 }] }],
			},
		});
	});

	it('builds a metric query', () => {
		expect(
			metricQuery({
				name: 'A',
				filter: '',
				metric: 'signoz_latency.bucket',
				timeAggregation: '',
				spaceAggregation: 'p99',
				reduceTo: 'avg',
			}).spec,
		).toStrictEqual({
			name: 'A',
			signal: 'metrics',
			filter: { expression: '' },
			groupBy: [],
			aggregations: [
				{
					metricName: 'signoz_latency.bucket',
					temporality: '',
					timeAggregation: '',
					spaceAggregation: 'p99',
					reduceTo: 'avg',
				},
			],
		});
	});

	it('wraps queries in a request over the window', () => {
		const request = rangeRequest(
			{ start: 1, end: 2, seconds: 1, step: 60 },
			'scalar',
			[],
		);
		expect(request).toStrictEqual(
			expect.objectContaining({
				start: 1,
				end: 2,
				requestType: 'scalar',
				compositeQuery: { queries: [] },
			}),
		);
	});
});

describe('response parsers', () => {
	const scalar = {
		type: 'scalar',
		data: {
			results: [
				{
					queryName: 'A',
					columns: [
						{
							name: 'service.name',
							queryName: 'A',
							aggregationIndex: 0,
							columnType: 'group',
						},
						{
							name: '__result_0',
							queryName: 'A',
							aggregationIndex: 0,
							columnType: 'aggregation',
						},
						{
							name: '__result_1',
							queryName: 'A',
							aggregationIndex: 1,
							columnType: 'aggregation',
						},
					],
					data: [
						['frontend', 1332, '785784696.69'],
						['payment', 599, null],
					],
				},
			],
		},
	};

	it('reads scalar rows by group label and aggregation index', () => {
		expect(scalarRows(scalar, 'A')).toStrictEqual([
			{ labels: { 'service.name': 'frontend' }, values: [1332, 785784696.69] },
			{ labels: { 'service.name': 'payment' }, values: [599, Number.NaN] },
		]);
		expect(scalarRows(scalar, 'B')).toStrictEqual([]);
		expect(scalarRows(undefined, 'A')).toStrictEqual([]);
	});

	it('reads time series sorted by timestamp, without partial buckets', () => {
		const series = {
			type: 'time_series',
			data: {
				results: [
					{
						queryName: 'A',
						aggregations: [
							{
								index: 1,
								alias: '',
								meta: {},
								series: [
									{
										labels: [{ key: { name: 'service.name' }, value: 'route' }],
										values: [
											{ timestamp: 2000, value: 4 },
											{ timestamp: 3000, value: 1, partial: true },
											{ timestamp: 1000, value: 3 },
										],
									},
								],
							},
						],
					},
				],
			},
		};
		expect(seriesOf(series, 'A', 1)).toStrictEqual([
			{
				labels: { 'service.name': 'route' },
				points: [
					{ timestamp: 1000, value: 3 },
					{ timestamp: 2000, value: 4 },
				],
			},
		]);
		expect(seriesOf(series, 'A', 0)).toStrictEqual([]);
	});
});
