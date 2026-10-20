import { QueryEnvelope, QueryRangeRequestV5 } from 'types/api/v5/queryRange';

import {
	allOf,
	entrySpansFilter,
	errorSpansFilter,
	metricErrorFilter,
	serviceOperationsFilter,
} from './filters';
import {
	metricQuery,
	rangeRequest,
	RangeResponse,
	scalarRows,
	Series,
	seriesOf,
	traceQuery,
} from './queryRange';
import { NS_PER_MS, SPAN_METRIC } from './spanMetrics';
import { ApmSource, PeriodStats } from './types';
import { ApmWindow } from './window';

const GROUP = ['service.name'];
const TRACE_TOTALS = [
	'count()',
	`countIf(${errorSpansFilter})`,
	'p50(duration_nano)',
	'p95(duration_nano)',
	'p99(duration_nano)',
];
const TRACE_SERIES = [
	'count()',
	`countIf(${errorSpansFilter})`,
	'p99(duration_nano)',
];

export interface ServicesListInput {
	source: ApmSource;
	window: ApmWindow;
	resourceFilter: string;
	/** Span metrics only: each service's top-level operations. */
	topLevelOperations: [string, string[]][];
}

export interface ServiceSparks {
	rate: number[];
	errorRate: number[];
	p99: number[];
}

export interface ServiceApm {
	current: PeriodStats;
	previous?: PeriodStats;
	sparks: ServiceSparks;
}

function metricTotals(filter: string, shift?: number): QueryEnvelope[] {
	const names = shift ? ['F', 'G', 'H', 'I', 'J'] : ['A', 'B', 'C', 'D', 'E'];
	const count = (name: string, where: string): QueryEnvelope =>
		metricQuery({
			name,
			filter: where,
			groupBy: GROUP,
			metric: SPAN_METRIC.calls,
			timeAggregation: 'increase',
			spaceAggregation: 'sum',
			reduceTo: 'sum',
			shift,
		});
	const percentile = (name: string, p: 'p50' | 'p95' | 'p99'): QueryEnvelope =>
		metricQuery({
			name,
			filter,
			groupBy: GROUP,
			metric: SPAN_METRIC.latencyBucket,
			timeAggregation: '',
			spaceAggregation: p,
			reduceTo: 'avg',
			shift,
		});
	return [
		count(names[0], filter),
		count(names[1], allOf(filter, metricErrorFilter)),
		percentile(names[2], 'p50'),
		percentile(names[3], 'p95'),
		percentile(names[4], 'p99'),
	];
}

function metricSeries(filter: string, step: number): QueryEnvelope[] {
	const rate = (name: string, where: string): QueryEnvelope =>
		metricQuery({
			name,
			filter: where,
			groupBy: GROUP,
			metric: SPAN_METRIC.calls,
			timeAggregation: 'rate',
			spaceAggregation: 'sum',
			step,
		});
	return [
		rate('A', filter),
		rate('B', allOf(filter, metricErrorFilter)),
		metricQuery({
			name: 'C',
			filter,
			groupBy: GROUP,
			metric: SPAN_METRIC.latencyBucket,
			timeAggregation: '',
			spaceAggregation: 'p99',
			step,
		}),
	];
}

/** One scalar request (this and the previous period) and one sparkline request. */
export function servicesListRequests({
	source,
	window,
	resourceFilter,
	topLevelOperations,
}: ServicesListInput): {
	totals: QueryRangeRequestV5;
	series: QueryRangeRequestV5;
} {
	if (source === 'span-metrics') {
		const filter = allOf(
			serviceOperationsFilter(topLevelOperations),
			resourceFilter,
		);
		return {
			totals: rangeRequest(window, 'scalar', [
				...metricTotals(filter),
				...metricTotals(filter, window.seconds),
			]),
			series: rangeRequest(
				window,
				'time_series',
				metricSeries(filter, window.step),
			),
		};
	}
	const filter = allOf(entrySpansFilter, resourceFilter);
	const totals = (name: string, shift?: number): QueryEnvelope =>
		traceQuery({
			name,
			filter,
			groupBy: GROUP,
			aggregations: TRACE_TOTALS,
			shift,
		});
	return {
		totals: rangeRequest(window, 'scalar', [
			totals('A'),
			totals('B', window.seconds),
		]),
		series: rangeRequest(window, 'time_series', [
			traceQuery({
				name: 'A',
				filter,
				groupBy: GROUP,
				aggregations: TRACE_SERIES,
				step: window.step,
			}),
		]),
	};
}

const finite = (value: number | undefined): number =>
	value !== undefined && Number.isFinite(value) ? value : 0;

function periodStats(
	requests: number,
	errors: number,
	latencies: [number, number, number],
	seconds: number,
): PeriodStats {
	return {
		requests,
		rate: requests / seconds,
		errors,
		errorRate: requests > 0 ? (errors / requests) * 100 : 0,
		p50: latencies[0],
		p95: latencies[1],
		p99: latencies[2],
	};
}

type Valued = Record<string, number[]>;

/** Values of a query's rows by service, each row's aggregations in order. */
function byService(
	response: RangeResponse | undefined,
	queryName: string,
): Valued {
	return Object.fromEntries(
		scalarRows(response, queryName).map((row) => [
			row.labels['service.name'],
			row.values,
		]),
	);
}

const seriesByService = (series: Series[]): Record<string, Series> =>
	Object.fromEntries(series.map((item) => [item.labels['service.name'], item]));

const valuesOf = (series: Series | undefined): number[] =>
	series?.points.map((point) => finite(point.value)) ?? [];

/** errors ÷ calls per point, matched by timestamp. */
function errorRates(
	calls: Series | undefined,
	errors: Series | undefined,
): number[] {
	const failed = new Map(
		(errors?.points ?? []).map((point) => [point.timestamp, point.value]),
	);
	return (calls?.points ?? []).map((point) =>
		point.value > 0
			? (finite(failed.get(point.timestamp)) / point.value) * 100
			: 0,
	);
}

function traceStats(
	window: ApmWindow,
	totals: RangeResponse | undefined,
	series: RangeResponse | undefined,
): Record<string, ServiceApm> {
	const current = byService(totals, 'A');
	const previous = byService(totals, 'B');
	const calls = seriesByService(seriesOf(series, 'A', 0));
	const errors = seriesByService(seriesOf(series, 'A', 1));
	const p99 = seriesByService(seriesOf(series, 'A', 2));
	const toStats = (values: number[]): PeriodStats =>
		periodStats(
			finite(values[0]),
			finite(values[1]),
			[
				finite(values[2]) / NS_PER_MS,
				finite(values[3]) / NS_PER_MS,
				finite(values[4]) / NS_PER_MS,
			],
			window.seconds,
		);
	return Object.fromEntries(
		Object.entries(current).map(([service, values]) => [
			service,
			{
				current: toStats(values),
				previous: previous[service] ? toStats(previous[service]) : undefined,
				sparks: {
					rate: valuesOf(calls[service]).map((count) => count / window.step),
					errorRate: errorRates(calls[service], errors[service]),
					p99: valuesOf(p99[service]).map((ns) => ns / NS_PER_MS),
				},
			},
		]),
	);
}

function metricStats(
	window: ApmWindow,
	totals: RangeResponse | undefined,
	series: RangeResponse | undefined,
): Record<string, ServiceApm> {
	const read = (names: string[]): Record<string, number[]> => {
		const columns = names.map((name) => byService(totals, name));
		const services = Object.keys(columns[0]);
		return Object.fromEntries(
			services.map((service) => [
				service,
				columns.map((column) => finite(column[service]?.[0])),
			]),
		);
	};
	const current = read(['A', 'B', 'C', 'D', 'E']);
	const previous = read(['F', 'G', 'H', 'I', 'J']);
	const calls = seriesByService(seriesOf(series, 'A'));
	const errors = seriesByService(seriesOf(series, 'B'));
	const p99 = seriesByService(seriesOf(series, 'C'));
	const toStats = (values: number[]): PeriodStats =>
		periodStats(
			values[0],
			values[1],
			[values[2], values[3], values[4]],
			window.seconds,
		);
	return Object.fromEntries(
		Object.entries(current).map(([service, values]) => [
			service,
			{
				current: toStats(values),
				previous: previous[service] ? toStats(previous[service]) : undefined,
				sparks: {
					rate: valuesOf(calls[service]),
					errorRate: errorRates(calls[service], errors[service]),
					p99: valuesOf(p99[service]),
				},
			},
		]),
	);
}

/** Per-service stats for this and the previous period, plus sparklines. */
export function servicesListStats(
	source: ApmSource,
	window: ApmWindow,
	totals: RangeResponse | undefined,
	series: RangeResponse | undefined,
): Record<string, ServiceApm> {
	return source === 'span-metrics'
		? metricStats(window, totals, series)
		: traceStats(window, totals, series);
}
