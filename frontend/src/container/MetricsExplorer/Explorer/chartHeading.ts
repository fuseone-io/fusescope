import { IBuilderQuery, Query } from 'types/api/queryBuilder/queryBuilderData';
import { MetricAggregation } from 'types/api/v5/queryRange';

export interface ChartHeading {
	/** Query and formula names on the chart, e.g. ["A", "F1"]. */
	letters: string[];
	title: string;
	subtitle: string;
	/** The title is a metric name or expression, set in monospace. */
	isCode: boolean;
}

function capitalize(value: string): string {
	return value ? value[0].toUpperCase() + value.slice(1) : value;
}

function metricNameOf(query: IBuilderQuery): string {
	return (
		query.aggregateAttribute?.key ||
		(query.aggregations?.[0] as MetricAggregation | undefined)?.metricName ||
		''
	);
}

const TIME_AGGREGATION_LABELS: Record<string, string> = {
	rate: 'Rate per second',
	increase: 'Increase',
	count_distinct: 'Count distinct',
};

function groupByOf(query: IBuilderQuery): string {
	return (query.groupBy ?? []).map((item) => item.key).join(', ');
}

function describeQuery(query: IBuilderQuery): string {
	const aggregation = query.aggregations?.[0] as MetricAggregation | undefined;
	const time = query.timeAggregation || aggregation?.timeAggregation || '';
	const space = query.spaceAggregation || aggregation?.spaceAggregation || '';
	const filter = query.filter?.expression?.trim();
	const timePart = [
		TIME_AGGREGATION_LABELS[time] ?? capitalize(time),
		filter ? `where ${filter}` : '',
	]
		.filter(Boolean)
		.join(' ');
	const groupBy = groupByOf(query);
	const spacePart = groupBy
		? `${capitalize(space)} by ${groupBy}`
		: capitalize(space);
	return [timePart, spacePart].filter(Boolean).join(', ');
}

function describeFormula(
	expression: string,
	queryData: IBuilderQuery[],
): string {
	const used = queryData.filter((item) =>
		new RegExp(`\\b${item.queryName}\\b`).test(expression),
	);
	const groupBys = Array.from(new Set(used.map(groupByOf).filter(Boolean)));
	const names = used.map((item) => item.queryName).join(', ');
	const base = names ? `Formula of ${names}` : 'Formula';
	return groupBys.length === 1 ? `${base} by ${groupBys[0]}` : base;
}

/** Title line of a chart panel: the queries it plots and what they aggregate. */
export function getChartHeading(query: Query): ChartHeading {
	const queries = query.builder.queryData.filter(
		(item) => !item.disabled && metricNameOf(item),
	);
	const formulas = query.builder.queryFormulas.filter((item) => !item.disabled);
	const letters = [
		...queries.map((item) => item.queryName),
		...formulas.map((item) => item.queryName),
	];

	if (queries.length === 1 && formulas.length === 0) {
		return {
			letters,
			title: metricNameOf(queries[0]),
			subtitle: describeQuery(queries[0]),
			isCode: true,
		};
	}
	if (queries.length === 0 && formulas.length === 1) {
		return {
			letters,
			title: formulas[0].expression,
			subtitle: describeFormula(formulas[0].expression, query.builder.queryData),
			isCode: true,
		};
	}
	return {
		letters,
		title: 'All queries',
		subtitle: 'One chart for every visible query and formula',
		isCode: false,
	};
}
