import {
	aggregationSummary,
	cardSummary,
	resultSummary,
	summarizeQuery,
} from 'container/MetricsExplorer/Explorer/QueryPanel/summary';
import type { IBuilderQuery } from 'types/api/queryBuilder/queryBuilderData';
import { DataSource } from 'types/common/queryBuilder';

const SEPARATOR = ' · ';

const SOURCE_LABEL: Record<DataSource, string> = {
	[DataSource.METRICS]: 'Metrics',
	[DataSource.LOGS]: 'Logs',
	[DataSource.TRACES]: 'Traces',
};

function isMetrics(query: IBuilderQuery): boolean {
	return query.dataSource === DataSource.METRICS;
}

function expressions(query: IBuilderQuery): string {
	return (query.aggregations ?? [])
		.map((aggregation) =>
			'expression' in aggregation ? aggregation.expression?.trim() : '',
		)
		.filter(Boolean)
		.join(', ');
}

function groupByText(query: IBuilderQuery): string {
	const keys = (query.groupBy ?? []).map((item) => item.key).join(', ');
	return keys ? `by ${keys}` : '';
}

function whereText(query: IBuilderQuery): string {
	const where = query.filter?.expression?.trim();
	return where ? `where ${where}` : '';
}

/** A card's heading: the metric for a metrics query, else its source. */
export function panelQueryTitle(query: IBuilderQuery): string {
	if (isMetrics(query)) {
		return summarizeQuery(query).metric || 'Select a metric';
	}
	return SOURCE_LABEL[query.dataSource] ?? query.dataSource;
}

/** A collapsed card's one-line reading. */
export function panelQueryCardSummary(query: IBuilderQuery): string {
	if (isMetrics(query)) {
		return [SOURCE_LABEL[DataSource.METRICS], cardSummary(summarizeQuery(query))]
			.filter(Boolean)
			.join(SEPARATOR);
	}
	return (
		[expressions(query), groupByText(query), whereText(query)]
			.filter(Boolean)
			.join(SEPARATOR) || 'All rows'
	);
}

/** The Aggregation section's reading. */
export function panelAggregationSummary(query: IBuilderQuery): string {
	if (isMetrics(query)) {
		return aggregationSummary(query);
	}
	const step = query.stepInterval ? `${query.stepInterval}s` : 'auto';
	return [expressions(query) || 'count()', `every ${step}`].join(SEPARATOR);
}

/**
 * The Result section's reading. Logs and traces group there too, so their
 * breakdown leads.
 */
export function panelResultSummary(query: IBuilderQuery): string {
	const result = resultSummary(query);
	if (isMetrics(query)) {
		return result;
	}
	const parts = [groupByText(query), result === 'Defaults' ? '' : result].filter(
		Boolean,
	);
	return parts.length ? parts.join(SEPARATOR) : 'Defaults';
}
