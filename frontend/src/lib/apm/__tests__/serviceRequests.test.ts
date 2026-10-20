import {
	databasePeersRequest,
	endpointRequests,
	errorRequests,
	externalsRequest,
	latencyHistogramRequest,
	resourcesRequest,
} from '../serviceRequests';

const window = { start: 0, end: 3_600_000, seconds: 3600, step: 60 };
const base = { window, servicename: 'frontend', resourceFilter: '' };

type Spec = {
	name: string;
	signal: string;
	filter: { expression: string };
	groupBy: { name: string }[];
	aggregations: Record<string, unknown>[];
};
function present<T>(value: T | null): T {
	if (value === null) {
		throw new Error('expected a request');
	}
	return value;
}

const specs = (request: {
	compositeQuery: { queries: { spec: unknown }[] };
}): Spec[] => request.compositeQuery.queries.map((query) => query.spec as Spec);

describe('endpointRequests', () => {
	it('groups traces by span name, scoped to entry points when asked', () => {
		const { series, totals } = endpointRequests({
			...base,
			source: 'traces',
			groupBy: 'name',
			entryPoint: true,
			topLevelOperations: [],
		});
		expect(totals).toBeNull();
		const [spec] = specs(series);
		expect(spec.groupBy).toStrictEqual([{ name: 'name' }]);
		expect(spec.filter.expression).toBe(
			"service.name = 'frontend' AND (isRoot = true OR isEntryPoint = true)",
		);
		expect(spec.aggregations).toStrictEqual([
			{ expression: 'count()' },
			{ expression: 'sum(duration_nano)' },
			{ expression: 'p99(duration_nano)' },
		]);
	});

	it('reads percentiles per attribute value from traces', () => {
		const { totals } = endpointRequests({
			...base,
			source: 'traces',
			groupBy: 'http.route',
			entryPoint: false,
			topLevelOperations: [],
		});
		const [spec] = specs(present(totals));
		expect(spec.groupBy).toStrictEqual([{ name: 'http.route' }]);
		expect(spec.aggregations.map((item) => item.expression)).toStrictEqual([
			'count()',
			'countIf(has_error = true)',
			'p50(duration_nano)',
			'p95(duration_nano)',
			'p99(duration_nano)',
			'sum(duration_nano)',
		]);
	});

	it('reads span metrics by operation when use_span_metrics is on', () => {
		const { totals, series } = endpointRequests({
			...base,
			source: 'span-metrics',
			groupBy: 'name',
			entryPoint: true,
			topLevelOperations: ['/dispatch'],
		});
		expect(specs(present(totals)).map((spec) => spec.signal)).toStrictEqual(
			Array(6).fill('metrics'),
		);
		expect(specs(present(totals))[0].filter.expression).toBe(
			"service.name = 'frontend' AND operation IN ['/dispatch']",
		);
		expect(specs(series)[0].groupBy).toStrictEqual([{ name: 'operation' }]);
	});

	it('applies the page environment to every span-metrics endpoint query', () => {
		const { totals, series } = endpointRequests({
			...base,
			resourceFilter: "deployment.environment in ['prod']",
			source: 'span-metrics',
			groupBy: 'name',
			entryPoint: false,
			topLevelOperations: [],
		});
		[...specs(present(totals)), ...specs(series)].forEach((spec) =>
			expect(spec.filter.expression).toContain(
				"service.name = 'frontend' AND deployment.environment in ['prod']",
			),
		);
	});
});

describe('dependency requests', () => {
	it('finds database peers among spans of every service', () => {
		const [spec] = specs(databasePeersRequest(base));
		expect(spec.filter.expression).toBe(
			'peer.service EXISTS AND (db.system EXISTS OR db.statement EXISTS OR sql.query EXISTS)',
		);
		expect(spec.groupBy).toStrictEqual([{ name: 'peer.service' }]);
	});

	it('reads external calls by address, without host-less ones', () => {
		const [all, failed, durations] = specs(externalsRequest(base));
		expect(all.filter.expression).toBe(
			"service.name = 'frontend' AND address NOT REGEXP '^(0[.]0[.]0[.]0)?(:[0-9]*)?$|:$'",
		);
		expect(failed.filter.expression).toContain(
			"status.code = 'STATUS_CODE_ERROR'",
		);
		expect(durations.aggregations[0]).toStrictEqual(
			expect.objectContaining({ metricName: 'signoz_external_call_latency_sum' }),
		);
	});
});

describe('errorRequests', () => {
	it('counts error spans by status message and both periods of spans', () => {
		const [messages, totals, previous] = specs(errorRequests(base));
		expect(messages.filter.expression).toBe(
			"service.name = 'frontend' AND has_error = true",
		);
		expect(messages.groupBy).toStrictEqual([
			{ name: 'status_message' },
			{ name: 'name' },
		]);
		expect(totals.aggregations).toStrictEqual([
			{ expression: 'count()' },
			{ expression: 'countIf(has_error = true)' },
		]);
		expect(previous.name).toBe('C');
	});
});

describe('resourcesRequest', () => {
	it('reads hosts, environments and languages of the entry spans', () => {
		const [hosts, meta] = specs(resourcesRequest(base));
		expect(hosts.groupBy).toStrictEqual([{ name: 'host.name' }]);
		expect(meta.groupBy).toStrictEqual([
			{ name: 'deployment.environment' },
			{ name: 'telemetry.sdk.language' },
		]);
	});
});

describe('latencyHistogramRequest', () => {
	it('sums the latency buckets by le', () => {
		const [spec] = specs(
			latencyHistogramRequest({ ...base, topLevelOperations: ['/dispatch'] }),
		);
		expect(spec.groupBy).toStrictEqual([{ name: 'le' }]);
		expect(spec.aggregations[0]).toStrictEqual(
			expect.objectContaining({
				metricName: 'signoz_latency.bucket',
				timeAggregation: 'increase',
				spaceAggregation: 'sum',
				reduceTo: 'sum',
			}),
		);
	});
});
