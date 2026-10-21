import { QueryEnvelope, QueryRangeRequestV5 } from 'types/api/v5/queryRange';

import {
	allOf,
	entrySpansFilter,
	errorSpansFilter,
	inList,
	metricErrorFilter,
	metricOkFilter,
	okSpansFilter,
	serviceFilter,
} from './filters';
import { apdexFromBuckets, apdexScore, latencyBuckets } from './histogram';
import {
	metricQuery,
	rangeRequest,
	RangeResponse,
	scalarRows,
	traceQuery,
} from './queryRange';
import { NS_PER_MS, SPAN_METRIC } from './spanMetrics';
import { ApmSource, PeriodStats } from './types';
import { ApmWindow } from './window';

export interface ServiceKpiInput {
	source: ApmSource;
	window: ApmWindow;
	servicename: string;
	resourceFilter: string;
	/** Span metrics only: the service's top-level operations. */
	topLevelOperations: string[];
	/** Apdex T, seconds. */
	apdexThreshold: number;
}

export interface ServiceKpis {
	current?: PeriodStats;
	previous?: PeriodStats;
}

const CURRENT_METRICS = ['A', 'B', 'C', 'D', 'E', 'F'];
const PREVIOUS_METRICS = ['G', 'H', 'I', 'J', 'K', 'L'];

export const metricServiceFilter = (
	servicename: string,
	topLevelOperations: string[],
	resourceFilter: string,
): string =>
	allOf(
		serviceFilter(servicename),
		topLevelOperations.length
			? `operation IN ${inList(topLevelOperations)}`
			: undefined,
		resourceFilter,
	);

const TRACE_AGGREGATIONS = [
	'count()',
	`countIf(${errorSpansFilter})`,
	'p99(duration_nano)',
	'avg(duration_nano)',
];

/** As the Apdex chart counts: OK spans within T and within 4T, over all spans. */
function traceApdexAggregations(apdexThreshold: number): string[] {
	const satisfied = Math.round(apdexThreshold * 1e9);
	return [
		'count()',
		`countIf(${okSpansFilter} AND duration_nano <= ${satisfied})`,
		`countIf(${okSpansFilter} AND duration_nano <= ${satisfied * 4})`,
	];
}

function metricQueries(
	names: string[],
	filter: string,
	shift?: number,
): QueryEnvelope[] {
	const increase = (
		name: string,
		metric: string,
		where: string,
		groupBy?: string[],
	): QueryEnvelope =>
		metricQuery({
			name,
			filter: where,
			groupBy,
			metric,
			timeAggregation: 'increase',
			spaceAggregation: 'sum',
			reduceTo: 'sum',
			shift,
		});
	return [
		increase(names[0], SPAN_METRIC.calls, filter),
		increase(names[1], SPAN_METRIC.calls, allOf(filter, metricErrorFilter)),
		metricQuery({
			name: names[2],
			filter,
			metric: SPAN_METRIC.latencyBucket,
			timeAggregation: '',
			spaceAggregation: 'p99',
			reduceTo: 'avg',
			shift,
		}),
		increase(names[3], SPAN_METRIC.latencySum, filter),
		increase(names[4], SPAN_METRIC.latencyCount, filter),
		increase(names[5], SPAN_METRIC.latencyBucket, allOf(filter, metricOkFilter), [
			'le',
		]),
	];
}

/** The KPI strip's request, from the same source as the charts. */
export function serviceKpiRequest(input: ServiceKpiInput): QueryRangeRequestV5 {
	const { source, window, servicename, resourceFilter } = input;
	if (source === 'span-metrics') {
		const filter = metricServiceFilter(
			servicename,
			input.topLevelOperations,
			resourceFilter,
		);
		return rangeRequest(window, 'scalar', [
			...metricQueries(CURRENT_METRICS, filter),
			...metricQueries(PREVIOUS_METRICS, filter, window.seconds),
		]);
	}
	const filter = allOf(
		serviceFilter(servicename),
		entrySpansFilter,
		resourceFilter,
	);
	const aggregations = TRACE_AGGREGATIONS;
	const queries = [
		traceQuery({ name: 'A', filter, aggregations }),
		traceQuery({ name: 'B', filter, aggregations, shift: window.seconds }),
	];
	if (input.topLevelOperations.length === 0) {
		return rangeRequest(window, 'scalar', queries);
	}
	const apdexFilter = allOf(
		serviceFilter(servicename),
		`name IN ${inList(input.topLevelOperations)}`,
		resourceFilter,
	);
	const apdexAggregations = traceApdexAggregations(input.apdexThreshold);
	return rangeRequest(window, 'scalar', [
		...queries,
		traceQuery({
			name: 'C',
			filter: apdexFilter,
			aggregations: apdexAggregations,
		}),
		traceQuery({
			name: 'D',
			filter: apdexFilter,
			aggregations: apdexAggregations,
			shift: window.seconds,
		}),
	]);
}

const finite = (value: number | undefined): number =>
	value !== undefined && Number.isFinite(value) ? value : 0;

function stats(
	requests: number,
	errors: number,
	p99: number,
	avg: number,
	apdex: number | undefined,
	seconds: number,
): PeriodStats {
	return {
		requests,
		rate: requests / seconds,
		errors,
		errorRate: requests > 0 ? (errors / requests) * 100 : 0,
		p99,
		avg,
		apdex,
	};
}

function traceApdex(
	response: RangeResponse | undefined,
	name: string,
): number | undefined {
	const [row] = scalarRows(response, name);
	if (!row) {
		return undefined;
	}
	const [total, satisfied, withinFourT] = row.values.map(finite);
	return apdexScore({ total, satisfied, tolerating: withinFourT - satisfied });
}

function tracePeriod(
	response: RangeResponse | undefined,
	names: [string, string],
	window: ApmWindow,
): PeriodStats | undefined {
	const [row] = scalarRows(response, names[0]);
	if (!row) {
		return undefined;
	}
	const [requests, errors, p99, avg] = row.values.map(finite);
	return stats(
		requests,
		errors,
		p99 / NS_PER_MS,
		avg / NS_PER_MS,
		traceApdex(response, names[1]),
		window.seconds,
	);
}

function metricPeriod(
	response: RangeResponse | undefined,
	names: string[],
	window: ApmWindow,
	apdexThreshold: number,
): PeriodStats | undefined {
	const first = (name: string): number | undefined =>
		scalarRows(response, name)[0]?.values[0];
	const requests = first(names[0]);
	if (requests === undefined) {
		return undefined;
	}
	const latencySum = finite(first(names[3]));
	const latencyCount = finite(first(names[4]));
	const buckets = latencyBuckets(
		scalarRows(response, names[5]).map((row) => ({
			le: row.labels.le,
			count: finite(row.values[0]),
		})),
	);
	return stats(
		finite(requests),
		finite(first(names[1])),
		finite(first(names[2])),
		latencyCount > 0 ? latencySum / latencyCount : 0,
		apdexFromBuckets(buckets, apdexThreshold * 1000, latencyCount),
		window.seconds,
	);
}

export function serviceKpis(
	source: ApmSource,
	window: ApmWindow,
	response: RangeResponse | undefined,
	apdexThreshold = 0.5,
): ServiceKpis {
	if (source === 'span-metrics') {
		return {
			current: metricPeriod(response, CURRENT_METRICS, window, apdexThreshold),
			previous: metricPeriod(response, PREVIOUS_METRICS, window, apdexThreshold),
		};
	}
	return {
		current: tracePeriod(response, ['A', 'C'], window),
		previous: tracePeriod(response, ['B', 'D'], window),
	};
}
