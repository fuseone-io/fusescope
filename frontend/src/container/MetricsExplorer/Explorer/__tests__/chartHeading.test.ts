import { initialQueriesMap } from 'constants/queryBuilder';
import { Query } from 'types/api/queryBuilder/queryBuilderData';
import { DataSource } from 'types/common/queryBuilder';

import { getChartHeading } from '../chartHeading';

const base = initialQueriesMap[DataSource.METRICS];
const queryA = {
	...base.builder.queryData[0],
	queryName: 'A',
	aggregateAttribute: {
		...base.builder.queryData[0].aggregateAttribute,
		key: 'signoz_calls_total',
	},
	timeAggregation: 'rate',
	spaceAggregation: 'sum',
	groupBy: [{ key: 'service.name', dataType: 'string', type: 'resource' }],
} as Query['builder']['queryData'][number];

function withQueries(
	queryData: Query['builder']['queryData'],
	queryFormulas: Query['builder']['queryFormulas'] = [],
): Query {
	return { ...base, builder: { ...base.builder, queryData, queryFormulas } };
}

describe('getChartHeading', () => {
	it('names a single query by its metric and aggregation', () => {
		expect(getChartHeading(withQueries([queryA]))).toStrictEqual({
			letters: ['A'],
			title: 'signoz_calls_total',
			subtitle: 'Rate per second, Sum by service.name',
			isCode: true,
		});
	});

	it('names a formula chart by its expression', () => {
		const heading = getChartHeading(
			withQueries(
				[{ ...queryA, disabled: true }],
				[
					{
						queryName: 'F1',
						expression: 'A * 2',
						disabled: false,
						legend: '',
					} as Query['builder']['queryFormulas'][number],
				],
			),
		);
		expect(heading).toStrictEqual({
			letters: ['F1'],
			title: 'A * 2',
			subtitle: 'Formula of A by service.name',
			isCode: true,
		});
	});

	it('mentions the filter of a filtered query', () => {
		const heading = getChartHeading(
			withQueries([
				{
					...queryA,
					filter: { expression: "status.code = 'STATUS_CODE_ERROR'" },
				},
			]),
		);
		expect(heading.subtitle).toBe(
			"Rate per second where status.code = 'STATUS_CODE_ERROR', Sum by service.name",
		);
	});

	it('calls a chart with several queries All queries', () => {
		const heading = getChartHeading(
			withQueries([queryA, { ...queryA, queryName: 'B' }]),
		);
		expect(heading.letters).toStrictEqual(['A', 'B']);
		expect(heading.title).toBe('All queries');
		expect(heading.isCode).toBe(false);
	});
});
