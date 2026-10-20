/**
 * AI-owned. Generated and maintained by the `signoz-page-story` skill.
 * Do not hand-edit: regenerate instead.
 */

import type {
	MetricAggregation,
	QueryRangeRequestV5,
	TraceAggregation,
} from 'types/api/v5/queryRange';

import { seededMetricValue } from '@/storybook/msw/__story_mockdata__/queryRange';

const LE_BOUNDS = ['10', '50', '100', '250', '500', '1000', '2500', '+Inf'];
const LE_SHARE = [0.04, 0.08, 0.12, 0.3, 0.72, 0.95, 0.995, 1];
const POINTS = 30;

interface QuerySpec {
	name: string;
	signal?: string;
	groupBy?: { name: string }[];
	aggregations?: (TraceAggregation | MetricAggregation)[];
	functions?: { name: string }[];
	filter?: { expression?: string };
}

const expressionOf = (
	aggregation: TraceAggregation | MetricAggregation,
): string =>
	'expression' in aggregation
		? aggregation.expression
		: `${aggregation.spaceAggregation}(${aggregation.metricName})`;

/**
 * A plausible value for an aggregation: durations in ns from traces, in ms
 * from span metrics, counts and rates otherwise. Shifted queries read 20%
 * lower so the previous period draws apart from the current one.
 */
function valueFor(
	expression: string,
	row: number,
	shifted: boolean,
	filter = '',
): number {
	const scale = shifted ? 0.8 : 1;
	if (expression.includes('max(timestamp)')) {
		return 0;
	}
	if (/^p\d+\(duration_nano|^avg\(duration_nano/.test(expression)) {
		return seededMetricValue(row, 40, 600) * 1e6 * scale;
	}
	if (expression.startsWith('sum(duration_nano')) {
		return seededMetricValue(row, 400, 5000) * 2e8 * scale;
	}
	if (/^p\d+\(signoz_latency/.test(expression)) {
		return seededMetricValue(row, 40, 600) * scale;
	}
	if (
		expression.startsWith('countIf(has_error') ||
		/ERROR|has_error/.test(filter)
	) {
		return Math.round(seededMetricValue(row, 2, 60) * scale);
	}
	if (expression.startsWith('countIf(duration_nano')) {
		return Math.round(seededMetricValue(row, 100, 200) * scale);
	}
	return Math.round(seededMetricValue(row, 400, 5000) * scale);
}

type LabelValues = Record<string, readonly string[]>;

function groupsOf(
	spec: QuerySpec,
	labelValues: LabelValues,
): Record<string, string>[] {
	const keys = (spec.groupBy ?? []).map((key) => key.name);
	if (keys.length === 0) {
		return [{}];
	}
	const count = Math.max(...keys.map((key) => labelValues[key]?.length ?? 1));
	return Array.from({ length: count }, (_, row) =>
		Object.fromEntries(
			keys.map((key) => {
				const values = labelValues[key] ?? [`${key}-${row}`];
				return [key, values[row % values.length]];
			}),
		),
	);
}

function scalarResult(spec: QuerySpec, labelValues: LabelValues): unknown {
	const keys = (spec.groupBy ?? []).map((key) => key.name);
	const aggregations = spec.aggregations ?? [];
	const shifted = Boolean(spec.functions?.length);
	const isBuckets = keys.length === 1 && keys[0] === 'le';
	const rows = isBuckets
		? LE_BOUNDS.map((le, index) => [le, Math.round(6000 * LE_SHARE[index])])
		: groupsOf(spec, labelValues).map((labels, row) => [
				...keys.map((key) => labels[key]),
				...aggregations.map((aggregation) => {
					const expression = expressionOf(aggregation);
					return expression.includes('max(timestamp)')
						? new Date().toISOString()
						: valueFor(expression, row, shifted, spec.filter?.expression);
				}),
			]);
	return {
		queryName: spec.name,
		columns: [
			...keys.map((name) => ({ name, queryName: spec.name, columnType: 'group' })),
			...aggregations.map((_, index) => ({
				name: `__result_${index}`,
				queryName: spec.name,
				aggregationIndex: index,
				columnType: 'aggregation',
			})),
		],
		data: rows,
	};
}

function seriesResult(
	spec: QuerySpec,
	labelValues: LabelValues,
	start: number,
	end: number,
): unknown {
	const step = (end - start) / POINTS;
	return {
		queryName: spec.name,
		aggregations: (spec.aggregations ?? []).map((aggregation, index) => ({
			index,
			alias: '',
			meta: {},
			series: groupsOf(spec, labelValues).map((labels, row) => ({
				labels: Object.entries(labels).map(([name, value]) => ({
					key: { name },
					value,
				})),
				values: Array.from({ length: POINTS }, (_, point) => ({
					timestamp: Math.round(start + point * step),
					value:
						valueFor(expressionOf(aggregation), row, false, spec.filter?.expression) *
						(0.85 + (0.3 * (((point + row) * 37) % 10)) / 10),
				})),
			})),
		})),
	};
}

/** Answers any v5 query_range the APM pages send, by its shape. */
export const apmQueryRangeResponse = (
	body: QueryRangeRequestV5,
	labelValues: LabelValues,
): { status: string; data: unknown } => {
	const specs = body.compositeQuery.queries
		.filter((query) => query.type === 'builder_query')
		.map((query) => query.spec as QuerySpec);
	const results = specs.map((spec) =>
		body.requestType === 'time_series'
			? seriesResult(spec, labelValues, body.start, body.end)
			: scalarResult(spec, labelValues),
	);
	return {
		status: 'success',
		data: {
			type: body.requestType,
			data: { results },
			meta: { rowsScanned: 0, bytesScanned: 0, durationMs: 0, stepIntervals: {} },
		},
	};
};
