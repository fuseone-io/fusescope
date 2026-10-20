import {
	QueryEnvelope,
	QueryRangeRequestV5,
	RequestType,
	SpaceAggregation,
	TimeAggregation,
} from 'types/api/v5/queryRange';

import { ApmWindow } from './window';

type Reduce = 'sum' | 'avg' | 'last' | 'max' | 'min';

interface BaseSpec {
	name: string;
	filter: string;
	groupBy?: string[];
	/** Seconds to shift the query back, for the previous period. */
	shift?: number;
	step?: number;
	disabled?: boolean;
}

export interface TraceQuerySpec extends BaseSpec {
	aggregations: string[];
	limit?: number;
}

export interface MetricQuerySpec extends BaseSpec {
	metric: string;
	timeAggregation: TimeAggregation;
	spaceAggregation: SpaceAggregation;
	reduceTo?: Reduce;
}

function common(spec: BaseSpec): Record<string, unknown> {
	return {
		name: spec.name,
		...(spec.step ? { stepInterval: spec.step } : {}),
		...(spec.disabled ? { disabled: true } : {}),
		filter: { expression: spec.filter },
		groupBy: (spec.groupBy ?? []).map((name) => ({ name })),
	};
}

const shiftFunction = (shift?: number): Record<string, unknown> =>
	shift ? { functions: [{ name: 'timeShift', args: [{ value: shift }] }] } : {};

export function traceQuery(spec: TraceQuerySpec): QueryEnvelope {
	return {
		type: 'builder_query',
		spec: {
			...common(spec),
			signal: 'traces',
			aggregations: spec.aggregations.map((expression) => ({ expression })),
			...(spec.limit ? { limit: spec.limit } : {}),
			...shiftFunction(spec.shift),
		},
	} as QueryEnvelope;
}

export function metricQuery(spec: MetricQuerySpec): QueryEnvelope {
	return {
		type: 'builder_query',
		spec: {
			...common(spec),
			signal: 'metrics',
			aggregations: [
				{
					metricName: spec.metric,
					temporality: '',
					timeAggregation: spec.timeAggregation,
					spaceAggregation: spec.spaceAggregation,
					...(spec.reduceTo ? { reduceTo: spec.reduceTo } : {}),
				},
			],
			...shiftFunction(spec.shift),
		},
	} as QueryEnvelope;
}

export function rangeRequest(
	window: ApmWindow,
	requestType: RequestType,
	queries: QueryEnvelope[],
): QueryRangeRequestV5 {
	return {
		schemaVersion: 'v1',
		start: window.start,
		end: window.end,
		requestType,
		compositeQuery: { queries },
	};
}

/** Loose view of a v5 response; results are read defensively. */
export interface RangeResponse {
	type?: string;
	data?: { results?: unknown[] };
}

interface ScalarColumn {
	name: string;
	queryName?: string;
	aggregationIndex?: number;
	columnType?: string;
}

interface ScalarResult {
	queryName?: string;
	columns?: ScalarColumn[] | null;
	data?: unknown[][] | null;
}

interface SeriesResult {
	queryName?: string;
	aggregations?: {
		index: number;
		series?: {
			labels?: { key: { name: string }; value: unknown }[];
			values?: { timestamp: number; value: number; partial?: boolean }[];
		}[];
	}[];
}

export interface ScalarRow {
	labels: Record<string, string>;
	values: number[];
}

export interface Point {
	timestamp: number;
	value: number;
}

export interface Series {
	labels: Record<string, string>;
	points: Point[];
}

const results = <T>(response: RangeResponse | undefined): T[] =>
	(response?.data?.results ?? []) as T[];

const label = (value: unknown): string =>
	typeof value === 'string' ||
	typeof value === 'number' ||
	typeof value === 'boolean'
		? String(value)
		: '';

export interface RawScalarRow {
	labels: Record<string, string>;
	values: unknown[];
}

/** One row per group: group labels by name, raw aggregation cells by index. */
export function rawScalarRows(
	response: RangeResponse | undefined,
	queryName: string,
): RawScalarRow[] {
	return results<ScalarResult>(response).flatMap((result) => {
		const columns = (result.columns ?? [])
			.map((column, position) => ({ ...column, position }))
			.filter((column) => !column.queryName || column.queryName === queryName);
		const aggregations = columns
			.filter((column) => column.columnType === 'aggregation')
			.sort((a, b) => (a.aggregationIndex ?? 0) - (b.aggregationIndex ?? 0));
		if (aggregations.length === 0) {
			return [];
		}
		const groups = columns.filter((column) => column.columnType === 'group');
		return (result.data ?? []).map((row) => ({
			labels: Object.fromEntries(
				groups.map((column) => [column.name, label(row[column.position])]),
			),
			values: aggregations.map((column) => row[column.position]),
		}));
	});
}

/** One row per group: group labels by name, numeric aggregations by index. */
export function scalarRows(
	response: RangeResponse | undefined,
	queryName: string,
): ScalarRow[] {
	return rawScalarRows(response, queryName).map((row) => ({
		labels: row.labels,
		values: row.values.map((value) =>
			value === null || value === undefined ? Number.NaN : Number(value),
		),
	}));
}

/**
 * The series of one aggregation of one query, points in time order. Buckets
 * cut by the window edges are dropped: they hold a fraction of a step.
 */
export function seriesOf(
	response: RangeResponse | undefined,
	queryName: string,
	aggregationIndex = 0,
): Series[] {
	return results<SeriesResult>(response)
		.filter((result) => result.queryName === queryName)
		.flatMap((result) => result.aggregations ?? [])
		.filter((aggregation) => aggregation.index === aggregationIndex)
		.flatMap((aggregation) => aggregation.series ?? [])
		.map((series) => ({
			labels: Object.fromEntries(
				(series.labels ?? []).map((item) => [item.key.name, label(item.value)]),
			),
			points: (series.values ?? [])
				.filter((point) => !point.partial)
				.map(({ timestamp, value }) => ({ timestamp, value: Number(value) }))
				.sort((a, b) => a.timestamp - b.timestamp),
		}));
}
