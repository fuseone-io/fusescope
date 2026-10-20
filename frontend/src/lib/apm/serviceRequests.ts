import { QueryEnvelope, QueryRangeRequestV5 } from 'types/api/v5/queryRange';

import {
	allOf,
	entrySpansFilter,
	errorSpansFilter,
	inList,
	metricErrorFilter,
	serviceFilter,
} from './filters';
import { metricQuery, rangeRequest, traceQuery } from './queryRange';
import { metricServiceFilter } from './serviceKpis';
import { SPAN_METRIC } from './spanMetrics';
import { ApmSource } from './types';
import { ApmWindow } from './window';

interface ServiceScope {
	window: ApmWindow;
	servicename: string;
	resourceFilter: string;
}

export type EndpointGroupBy = 'name' | 'http.route' | 'rpc.method';

interface EndpointScope extends ServiceScope {
	source: ApmSource;
	groupBy: EndpointGroupBy;
	entryPoint: boolean;
	topLevelOperations: string[];
}

const sumIncrease = (
	name: string,
	metric: string,
	filter: string,
	groupBy: string[],
): QueryEnvelope =>
	metricQuery({
		name,
		filter,
		groupBy,
		metric,
		timeAggregation: 'increase',
		spaceAggregation: 'sum',
		reduceTo: 'sum',
	});

const percentile = (
	name: string,
	p: 'p50' | 'p95' | 'p99',
	filter: string,
	groupBy: string[],
	step?: number,
): QueryEnvelope =>
	metricQuery({
		name,
		filter,
		groupBy,
		metric: SPAN_METRIC.latencyBucket,
		timeAggregation: '',
		spaceAggregation: p,
		...(step ? { step } : { reduceTo: 'avg' }),
	});

/**
 * Traces: a time series by span name or attribute (count, summed duration,
 * p99), plus a scalar of percentiles per attribute value, which top
 * operations cannot give. Span metrics: both by operation.
 */
export function endpointRequests(scope: EndpointScope): {
	series: QueryRangeRequestV5;
	totals: QueryRangeRequestV5 | null;
} {
	const { window, servicename, resourceFilter } = scope;
	if (scope.source === 'span-metrics') {
		const filter = metricServiceFilter(
			servicename,
			scope.entryPoint ? scope.topLevelOperations : [],
			resourceFilter,
		);
		const groupBy = ['operation'];
		return {
			totals: rangeRequest(window, 'scalar', [
				sumIncrease('A', SPAN_METRIC.calls, filter, groupBy),
				sumIncrease(
					'B',
					SPAN_METRIC.calls,
					allOf(filter, metricErrorFilter),
					groupBy,
				),
				percentile('C', 'p50', filter, groupBy),
				percentile('D', 'p95', filter, groupBy),
				percentile('E', 'p99', filter, groupBy),
				sumIncrease('F', SPAN_METRIC.latencySum, filter, groupBy),
			]),
			series: rangeRequest(window, 'time_series', [
				metricQuery({
					name: 'A',
					filter,
					groupBy,
					metric: SPAN_METRIC.calls,
					timeAggregation: 'rate',
					spaceAggregation: 'sum',
					step: window.step,
				}),
				percentile('B', 'p99', filter, groupBy, window.step),
			]),
		};
	}
	const filter = allOf(
		serviceFilter(servicename),
		scope.entryPoint ? entrySpansFilter : undefined,
		resourceFilter,
	);
	const groupBy = [scope.groupBy];
	return {
		series: rangeRequest(window, 'time_series', [
			traceQuery({
				name: 'A',
				filter,
				groupBy,
				aggregations: ['count()', 'sum(duration_nano)', 'p99(duration_nano)'],
				step: window.step,
			}),
		]),
		totals:
			scope.groupBy === 'name'
				? null
				: rangeRequest(window, 'scalar', [
						traceQuery({
							name: 'A',
							filter,
							groupBy,
							aggregations: [
								'count()',
								`countIf(${errorSpansFilter})`,
								'p50(duration_nano)',
								'p95(duration_nano)',
								'p99(duration_nano)',
								'sum(duration_nano)',
							],
						}),
					]),
	};
}

/**
 * Peers named on spans that carry database attributes, by any service: the
 * client span to a database may come from the caller or from the database's
 * own instrumentation.
 */
export function databasePeersRequest({
	window,
	resourceFilter,
}: ServiceScope): QueryRangeRequestV5 {
	return rangeRequest(window, 'scalar', [
		traceQuery({
			name: 'A',
			filter: allOf(
				'peer.service EXISTS',
				'db.system EXISTS OR db.statement EXISTS OR sql.query EXISTS',
				resourceFilter,
			),
			groupBy: ['peer.service'],
			aggregations: ['count()'],
		}),
	]);
}

const HOSTLESS_ADDRESS = "address NOT REGEXP '^(0[.]0[.]0[.]0)?(:[0-9]*)?$|:$'";

/** Calls out of the mesh by address: all, failed, and their summed duration. */
export function externalsRequest({
	window,
	servicename,
	resourceFilter,
}: ServiceScope): QueryRangeRequestV5 {
	const filter = allOf(
		serviceFilter(servicename),
		HOSTLESS_ADDRESS,
		resourceFilter,
	);
	const rate = (name: string, metric: string, where: string): QueryEnvelope =>
		metricQuery({
			name,
			filter: where,
			groupBy: ['address'],
			metric,
			timeAggregation: 'rate',
			spaceAggregation: 'sum',
			reduceTo: 'avg',
		});
	return rangeRequest(window, 'scalar', [
		rate('A', SPAN_METRIC.externalCount, filter),
		rate('B', SPAN_METRIC.externalCount, allOf(filter, metricErrorFilter)),
		rate('C', SPAN_METRIC.externalSum, filter),
	]);
}

/** Error spans by status message and operation, and span totals for both periods. */
export function errorRequests({
	window,
	servicename,
	resourceFilter,
}: ServiceScope): QueryRangeRequestV5 {
	const filter = allOf(serviceFilter(servicename), resourceFilter);
	const totals = ['count()', `countIf(${errorSpansFilter})`];
	return rangeRequest(window, 'scalar', [
		traceQuery({
			name: 'A',
			filter: allOf(filter, errorSpansFilter),
			groupBy: ['status_message', 'name'],
			aggregations: ['count()'],
			limit: 50,
		}),
		traceQuery({ name: 'B', filter, aggregations: totals }),
		traceQuery({
			name: 'C',
			filter,
			aggregations: totals,
			shift: window.seconds,
		}),
	]);
}

/** Hosts serving the service's requests, and its environments and languages. */
export function resourcesRequest({
	window,
	servicename,
	resourceFilter,
}: ServiceScope): QueryRangeRequestV5 {
	const filter = allOf(
		serviceFilter(servicename),
		entrySpansFilter,
		resourceFilter,
	);
	return rangeRequest(window, 'scalar', [
		traceQuery({
			name: 'A',
			filter,
			groupBy: ['host.name'],
			aggregations: [
				'count()',
				`countIf(${errorSpansFilter})`,
				'p99(duration_nano)',
				'max(timestamp)',
			],
		}),
		traceQuery({
			name: 'B',
			filter,
			groupBy: ['deployment.environment', 'telemetry.sdk.language'],
			aggregations: ['count()'],
		}),
	]);
}

/** Requests by latency bucket over the range, from `signoz_latency.bucket`. */
export function latencyHistogramRequest({
	window,
	servicename,
	resourceFilter,
	topLevelOperations,
}: ServiceScope & { topLevelOperations: string[] }): QueryRangeRequestV5 {
	const filter = allOf(
		serviceFilter(servicename),
		topLevelOperations.length
			? `operation IN ${inList(topLevelOperations)}`
			: undefined,
		resourceFilter,
	);
	return rangeRequest(window, 'scalar', [
		sumIncrease('A', SPAN_METRIC.latencyBucket, filter, ['le']),
	]);
}
