/**
 * AI-owned. Generated and maintained by the `signoz-page-story` skill.
 * Do not hand-edit: regenerate instead.
 */

import type { DependencyGraphItem } from 'pages/ServiceMap/types';
import type {
	MetricAggregation,
	QueryRangeRequestV5,
	TraceAggregation,
} from 'types/api/v5/queryRange';

import { apmQueryRangeResponse } from 'pages/MetricsApplication/stories/__story_mockdata__/apmQueryRange';

/** Dependency-graph children that report no spans: the map infers them. */
export const UNTRACED = ['mysql', 'redis'];

const RPC_SERVICES = ['auth', 'catalogue', 'cart', 'payments'];
const LANGUAGES = ['go', 'nodejs', 'java', 'python', 'dotnet'];
const WINDOW_SECONDS = 3600;

interface QuerySpec {
	name: string;
	groupBy?: { name: string }[];
	aggregations?: (TraceAggregation | MetricAggregation)[];
	functions?: { name: string }[];
	filter?: { expression?: string };
}

interface ServiceRow {
	name: string;
	rate: number;
	errorRate: number;
	/** ns */
	p99: number;
}

/** Every traced service with the traffic and errors of the calls into it. */
export function tracedServices(graph: DependencyGraphItem[]): ServiceRow[] {
	const names = Array.from(
		new Set(graph.flatMap((edge) => [edge.parent, edge.child])),
	).filter((name) => !UNTRACED.includes(name));
	return names.map((name) => {
		const calls = graph.filter((edge) => edge.child === name);
		const out = graph.filter((edge) => edge.parent === name);
		const rate =
			calls.reduce((sum, edge) => sum + edge.callRate, 0) ||
			out.reduce((sum, edge) => sum + edge.callRate, 0);
		const failed = calls.reduce(
			(sum, edge) => sum + edge.callRate * edge.errorRate,
			0,
		);
		return {
			name,
			rate,
			errorRate: rate > 0 ? failed / rate : 0,
			p99: Math.max(40e6, ...calls.map((edge) => edge.p99)),
		};
	});
}

const expressionOf = (
	aggregation: TraceAggregation | MetricAggregation,
): string =>
	'expression' in aggregation ? aggregation.expression : aggregation.metricName;

function serviceValue(
	expression: string,
	service: ServiceRow,
	shifted: boolean,
): number {
	const requests = service.rate * WINDOW_SECONDS * (shifted ? 0.8 : 1);
	if (expression.startsWith('countIf(has_error')) {
		return Math.round((requests * service.errorRate) / 100);
	}
	if (expression.startsWith('countIf(duration_nano <=')) {
		return Math.round(requests * 0.9);
	}
	if (expression.startsWith('countIf(duration_nano')) {
		return Math.round(requests * 0.05);
	}
	const percentile = /^p(\d+)\(/.exec(expression);
	if (percentile) {
		return (service.p99 * Number(percentile[1])) / 99;
	}
	if (expression.startsWith('avg(')) {
		return service.p99 / 3;
	}
	return Math.round(requests);
}

const keysOf = (spec: QuerySpec): string[] =>
	(spec.groupBy ?? []).map((key) => key.name);

/** Rows for the grouped queries the map sends; null leaves a query to the APM mock. */
function mapRows(spec: QuerySpec, services: ServiceRow[]): unknown[][] | null {
	const keys = keysOf(spec).join(',');
	const filter = spec.filter?.expression ?? '';
	const shifted = Boolean(spec.functions?.length);
	const aggregations = (spec.aggregations ?? []).map(expressionOf);
	const values = (service: ServiceRow): number[] =>
		aggregations.map((expression) => serviceValue(expression, service, shifted));

	switch (keys) {
		case 'service.name': {
			let rows = services;
			if (/rpc\.method EXISTS/.test(filter)) {
				rows = services.filter((service) => RPC_SERVICES.includes(service.name));
			} else if (/http\.route EXISTS/.test(filter)) {
				rows = services.filter((service) => !RPC_SERVICES.includes(service.name));
			} else if (/(db|messaging)\.system EXISTS/.test(filter)) {
				rows = [];
			}
			return rows.map((service) => [service.name, ...values(service)]);
		}
		case 'service.name,telemetry.sdk.language':
			return services.map((service, index) => [
				service.name,
				LANGUAGES[index % LANGUAGES.length],
				...values(service),
			]);
		case 'service.name,rpc.system':
			return services
				.filter((service) => RPC_SERVICES.includes(service.name))
				.map((service) => [service.name, 'grpc', ...values(service)]);
		case 'service.name,peer.service':
			return services
				.filter((service) => service.name === 'stripe-proxy')
				.map((service) => [service.name, 'stripe-api', ...values(service)]);
		case 'service.name,address':
			return services
				.filter((service) => service.name === 'shipping')
				.map((service) => [
					service.name,
					'api.carrier.example.com',
					/STATUS_CODE_ERROR/.test(filter) ? 0 : 0.8,
				]);
		case 'db.system':
			return UNTRACED.map((name) => [name, 100]);
		case 'peer.service':
		case 'messaging.system':
			return [];
		default:
			return null;
	}
}

/** Answers the map's v5 query_range calls from the dependency graph it drew. */
export function mapQueryRangeResponse(
	body: QueryRangeRequestV5,
	graph: DependencyGraphItem[],
): { status: string; data: unknown } {
	const services = tracedServices(graph);
	const base = apmQueryRangeResponse(body, {
		'service.name': services.map((service) => service.name),
		'deployment.environment': ['production'],
		'telemetry.sdk.language': ['go'],
		'host.name': ['node-a', 'node-b'],
	}) as { status: string; data: { data: { results: unknown[] } } };
	if (body.requestType !== 'scalar') {
		return base;
	}
	const specs = body.compositeQuery.queries.map(
		(query) => query.spec as QuerySpec,
	);
	base.data.data.results = base.data.data.results.map((result, index) => {
		const rows = mapRows(specs[index], services);
		return rows ? { ...(result as object), data: rows } : result;
	});
	return base;
}
