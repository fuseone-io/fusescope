import { initialQueriesMap } from 'constants/queryBuilder';
import {
	IBuilderFormula,
	IBuilderQuery,
} from 'types/api/queryBuilder/queryBuilderData';
import { DataSource } from 'types/common/queryBuilder';

import {
	aggregationSummary,
	cardSummary,
	countLabel,
	functionsSummary,
	resultSummary,
	summarizeFormula,
	summarizeQuery,
} from '../summary';

const base = initialQueriesMap[DataSource.METRICS].builder.queryData[0];

function query(overrides: Partial<IBuilderQuery>): IBuilderQuery {
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
		groupBy: [],
		filter: { expression: '' },
		...overrides,
	} as IBuilderQuery;
}

const groupBy = (...keys: string[]): IBuilderQuery['groupBy'] =>
	keys.map((key) => ({
		key,
		dataType: 'string',
		type: 'tag',
	})) as IBuilderQuery['groupBy'];

describe('summarizeQuery', () => {
	it('reads a rate summed by a key as tokens and a PromQL-like line', () => {
		expect(
			summarizeQuery(query({ groupBy: groupBy('service.name') })),
		).toStrictEqual({
			metric: 'signoz_calls_total',
			metricType: 'Sum',
			where: '',
			overTime: 'rate · 60s',
			across: 'sum by service.name',
			options: [],
			promql: 'rate(signoz_calls_total[60s]) · sum by service.name',
		});
	});

	it('puts the filter in the where token and the selector', () => {
		const summary = summarizeQuery(
			query({ filter: { expression: "status.code = 'STATUS_CODE_ERROR'" } }),
		);
		expect(summary.where).toBe("status.code = 'STATUS_CODE_ERROR'");
		expect(summary.promql).toBe(
			"rate(signoz_calls_total{status.code = 'STATUS_CODE_ERROR'}[60s]) · sum",
		);
	});

	it.each([
		['avg', 'max', 'avg · 60s', 'max'],
		['increase', 'p99', 'increase · 60s', 'p99'],
		['latest', 'count', 'latest · 60s', 'count'],
	])('reads %s over time and %s across', (time, space, overTime, across) => {
		const summary = summarizeQuery(
			query({ timeAggregation: time, spaceAggregation: space }),
		);
		expect(summary.overTime).toBe(overTime);
		expect(summary.across).toBe(across);
	});

	it('says auto when no step is set and joins several keys', () => {
		const summary = summarizeQuery(
			query({
				stepInterval: undefined,
				groupBy: groupBy('service.name', 'operation'),
			}),
		);
		expect(summary.overTime).toBe('rate · auto');
		expect(summary.across).toBe('sum by service.name, operation');
		expect(summary.promql).toBe(
			'rate(signoz_calls_total[auto]) · sum by service.name, operation',
		);
	});

	it('lists the set options as key = value', () => {
		const summary = summarizeQuery(
			query({
				having: { expression: 'value > 5' },
				orderBy: [{ columnName: 'value', order: 'desc' }],
				limit: 10,
				legend: '{{service.name}}',
			}),
		);
		expect(summary.options).toStrictEqual([
			{ key: 'having', value: 'value > 5' },
			{ key: 'order by', value: 'value desc' },
			{ key: 'limit', value: '10' },
			{ key: 'legend', value: '{{service.name}}' },
		]);
	});

	it('falls back to the v5 aggregation for the metric and aggregations', () => {
		const summary = summarizeQuery(
			query({
				aggregateAttribute: { ...base.aggregateAttribute, key: '' },
				timeAggregation: '',
				spaceAggregation: '',
				aggregations: [
					{
						metricName: 'http_requests_total',
						temporality: 'cumulative',
						timeAggregation: 'rate',
						spaceAggregation: 'sum',
					},
				],
			} as unknown as Partial<IBuilderQuery>),
		);
		expect(summary.metric).toBe('http_requests_total');
		expect(summary.overTime).toBe('rate · 60s');
		expect(summary.across).toBe('sum');
	});

	it('shows a placeholder when no metric is picked', () => {
		const summary = summarizeQuery(
			query({
				aggregateAttribute: { ...base.aggregateAttribute, key: '' },
			} as Partial<IBuilderQuery>),
		);
		expect(summary.metric).toBe('');
		expect(summary.promql).toBe('');
	});
});

describe('summarizeFormula', () => {
	it('reads the expression and its legend', () => {
		expect(
			summarizeFormula({
				queryName: 'F1',
				expression: 'B / A * 100',
				disabled: false,
				legend: '{{service.name}} error %',
			} as IBuilderFormula),
		).toStrictEqual({
			expression: 'B / A * 100',
			options: [{ key: 'legend', value: '{{service.name}} error %' }],
		});
	});
});

describe('countLabel', () => {
	it.each([
		[1, 0, '1 query'],
		[2, 1, '2 queries · 1 formula'],
		[3, 2, '3 queries · 2 formulas'],
	])('%i queries and %i formulas read %s', (queries, formulas, label) => {
		expect(countLabel(queries, formulas)).toBe(label);
	});
});

describe('cardSummary', () => {
	it('reads a collapsed card as aggregation, filter and options', () => {
		expect(
			cardSummary(
				summarizeQuery(
					query({
						groupBy: groupBy('service.name'),
						filter: { expression: "status.code = 'STATUS_CODE_ERROR'" },
						limit: 10,
					}),
				),
			),
		).toBe(
			"rate · 60s · sum by service.name · where status.code = 'STATUS_CODE_ERROR' · limit 10",
		);
	});
});

describe('section summaries', () => {
	it('reads the aggregation with its breakdown, or says there is none', () => {
		expect(aggregationSummary(query({ groupBy: groupBy('service.name') }))).toBe(
			'rate · 60s · sum by service.name',
		);
		expect(aggregationSummary(query({ stepInterval: undefined }))).toBe(
			'rate · auto · sum · no breakdown',
		);
	});

	it('chains the functions in order with their arguments', () => {
		expect(
			functionsSummary(
				query({
					functions: [
						{ name: 'ewma5', args: [] },
						{ name: 'clampMax', args: [{ value: 100 }] },
					],
				} as unknown as Partial<IBuilderQuery>),
			),
		).toBe('EWMA 5 → Clamp Max 100');
		expect(functionsSummary(query({ functions: [] }))).toBe('None');
	});

	it('lists only the result options that are set', () => {
		expect(
			resultSummary(
				query({
					limit: 10,
					orderBy: [{ columnName: 'value', order: 'desc' }],
					legend: '{{service.name}}',
				}),
			),
		).toBe('limit 10 · order by value desc · legend');
		expect(resultSummary(query({ having: { expression: 'value > 5' } }))).toBe(
			'having value > 5',
		);
		expect(resultSummary(query({}))).toBe('Defaults');
	});

	it('summarizes a formula result the same way', () => {
		const formula = {
			queryName: 'F1',
			expression: 'A / B',
			disabled: false,
			legend: '',
			limit: 5,
		} as IBuilderFormula;
		expect(resultSummary(formula)).toBe('limit 5');
	});
});
