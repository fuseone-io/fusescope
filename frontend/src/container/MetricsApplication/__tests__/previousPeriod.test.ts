import {
	errorPercentage,
	latency,
} from '../MetricsPageQueries/OverviewQueries';
import { withPreviousPeriod } from '../MetricsPageQueries/previousPeriod';

const props = {
	servicename: 'frontend',
	tagFilterItems: [],
	topLevelOperations: ['HTTP GET /dispatch'],
	isSpanMetricEnable: true,
};

describe('withPreviousPeriod', () => {
	it('adds a shifted copy of the chosen series, named after the existing ones', () => {
		const builder = latency({
			...props,
			topLevelOperationsRoute: props.topLevelOperations,
		});
		const { builder: shifted, dashedQueryNames } = withPreviousPeriod(
			builder,
			3600,
			{
				legends: ['p99'],
			},
		);

		expect(shifted.queryData).toHaveLength(builder.queryData.length + 1);
		const copy = shifted.queryData[shifted.queryData.length - 1];
		expect(copy).toStrictEqual(
			expect.objectContaining({
				queryName: 'D',
				expression: 'D',
				legend: 'p99, previous period',
				disabled: false,
				functions: [{ name: 'timeShift', args: [3600] }],
			}),
		);
		expect(dashedQueryNames).toStrictEqual(['D']);
		expect(builder.queryData).toHaveLength(3);
	});

	it('shifts every query behind a formula and repeats the formula over them', () => {
		const builder = errorPercentage(props);
		const { builder: shifted, dashedQueryNames } = withPreviousPeriod(
			builder,
			900,
		);

		expect(
			shifted.queryData.map((query) => [query.queryName, query.disabled]),
		).toStrictEqual([
			['A', true],
			['B', true],
			['C', true],
			['D', true],
		]);
		expect(shifted.queryFormulas).toStrictEqual([
			builder.queryFormulas[0],
			expect.objectContaining({
				queryName: 'F2',
				expression: builder.queryFormulas[0].expression
					.replace(/\bA\b/g, 'C')
					.replace(/\bB\b/g, 'D'),
				legend: `${builder.queryFormulas[0].legend}, previous period`,
			}),
		]);
		expect(dashedQueryNames).toStrictEqual(['F2']);
	});

	it('returns the builder untouched for a zero shift', () => {
		const builder = errorPercentage(props);
		expect(withPreviousPeriod(builder, 0)).toStrictEqual({
			builder,
			dashedQueryNames: [],
		});
	});
});
