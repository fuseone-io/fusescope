import { initialQueriesMap } from 'constants/queryBuilder';
import type { IBuilderQuery } from 'types/api/queryBuilder/queryBuilderData';
import { DataSource } from 'types/common/queryBuilder';

import {
	panelAggregationSummary,
	panelQueryCardSummary,
	panelQueryTitle,
	panelResultSummary,
} from '../panelQuerySummary';

const groupBy = (...keys: string[]): IBuilderQuery['groupBy'] =>
	keys.map((key) => ({
		key,
		dataType: 'string',
		type: 'tag',
	})) as IBuilderQuery['groupBy'];

function metrics(overrides: Partial<IBuilderQuery> = {}): IBuilderQuery {
	const base = initialQueriesMap[DataSource.METRICS].builder.queryData[0];
	return {
		...base,
		aggregateAttribute: {
			...base.aggregateAttribute,
			key: 'signoz_calls_total',
			type: 'Sum',
		},
		timeAggregation: 'rate',
		spaceAggregation: 'sum',
		stepInterval: 60,
		groupBy: groupBy('service.name'),
		filter: { expression: '' },
		...overrides,
	} as IBuilderQuery;
}

function logs(overrides: Partial<IBuilderQuery> = {}): IBuilderQuery {
	const base = initialQueriesMap[DataSource.LOGS].builder.queryData[0];
	return {
		...base,
		aggregations: [{ expression: 'count()' }],
		stepInterval: null,
		groupBy: [],
		filter: { expression: '' },
		...overrides,
	} as IBuilderQuery;
}

function traces(overrides: Partial<IBuilderQuery> = {}): IBuilderQuery {
	const base = initialQueriesMap[DataSource.TRACES].builder.queryData[0];
	return {
		...logs(),
		...base,
		dataSource: DataSource.TRACES,
		aggregations: [{ expression: 'p99(duration_nano)' }],
		groupBy: [],
		filter: { expression: '' },
		...overrides,
	} as IBuilderQuery;
}

describe('panelQueryTitle', () => {
	it.each([
		['a metric query by its metric', metrics(), 'signoz_calls_total'],
		[
			'a metric query with no metric yet',
			metrics({
				aggregateAttribute: undefined,
				aggregations: [],
			} as Partial<IBuilderQuery>),
			'Select a metric',
		],
		['a logs query', logs(), 'Logs'],
		['a traces query', traces(), 'Traces'],
	])('%s', (_name, query, expected) => {
		expect(panelQueryTitle(query)).toBe(expected);
	});
});

describe('panelQueryCardSummary', () => {
	it.each([
		[
			'metrics: source, aggregation and breakdown',
			metrics(),
			'Metrics · rate · 60s · sum by service.name',
		],
		[
			'metrics: with a filter',
			metrics({ filter: { expression: "service.name = 'redis'" } }),
			"Metrics · rate · 60s · sum by service.name · where service.name = 'redis'",
		],
		[
			'logs: aggregation and group by',
			logs({ groupBy: groupBy('service.name') }),
			'count() · by service.name',
		],
		[
			'traces: several aggregations and a filter',
			traces({
				aggregations: [
					{ expression: 'p99(duration_nano)' },
					{ expression: 'count()' },
				],
				filter: { expression: 'has_error = true' },
			} as Partial<IBuilderQuery>),
			'p99(duration_nano), count() · where has_error = true',
		],
		[
			'logs: raw rows',
			logs({ aggregations: [] } as Partial<IBuilderQuery>),
			'All rows',
		],
	])('%s', (_name, query, expected) => {
		expect(panelQueryCardSummary(query)).toBe(expected);
	});
});

describe('panelAggregationSummary', () => {
	it.each([
		['metrics', metrics(), 'rate · 60s · sum by service.name'],
		['logs with auto step', logs(), 'count() · every auto'],
		[
			'traces with a fixed step',
			traces({ stepInterval: 300 }),
			'p99(duration_nano) · every 300s',
		],
	])('%s', (_name, query, expected) => {
		expect(panelAggregationSummary(query)).toBe(expected);
	});
});

describe('panelResultSummary', () => {
	it.each([
		['metrics defaults', metrics(), 'Defaults'],
		['metrics with a limit', metrics({ limit: 10 }), 'limit 10'],
		['logs defaults', logs(), 'Defaults'],
		[
			'logs group by and limit',
			logs({ groupBy: groupBy('service.name', 'host.name'), limit: 5 }),
			'by service.name, host.name · limit 5',
		],
	])('%s', (_name, query, expected) => {
		expect(panelResultSummary(query)).toBe(expected);
	});
});
