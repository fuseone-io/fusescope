import { DataTypes } from 'types/api/queryBuilder/queryAutocompleteResponse';
import {
	IBuilderQuery,
	TagFilterItem,
} from 'types/api/queryBuilder/queryBuilderData';
import { DataSource } from 'types/common/queryBuilder';

import {
	apDexTracesQueryBuilderQueries,
	errorPercentage,
	operationPerSec,
} from '../MetricsPageQueries/OverviewQueries';

const env: TagFilterItem = {
	id: 'env',
	key: {
		key: 'deployment.environment',
		dataType: DataTypes.String,
		type: 'resource',
	},
	op: 'IN',
	value: ['prod'],
};

const props = {
	servicename: 'frontend',
	tagFilterItems: [env],
	topLevelOperations: ['HTTP GET /dispatch'],
};

function filtersOf(query: IBuilderQuery): Record<string, unknown> {
	return Object.fromEntries(
		(query.filters?.items ?? []).map((item) => [item.key?.key, item.value]),
	);
}

describe('Overview rate and error queries', () => {
	it('read span metrics when span metrics are on', () => {
		const rate = operationPerSec({ ...props, isSpanMetricEnable: true });
		const errors = errorPercentage({ ...props, isSpanMetricEnable: true });

		expect(rate.queryData[0].dataSource).toBe(DataSource.METRICS);
		errors.queryData.forEach((query) =>
			expect(query.dataSource).toBe(DataSource.METRICS),
		);
	});

	it('count top-level spans per second from traces when span metrics are off', () => {
		const [rate] = operationPerSec({
			...props,
			isSpanMetricEnable: false,
		}).queryData;

		expect(rate.dataSource).toBe(DataSource.TRACES);
		expect(rate.aggregateOperator).toBe('rate');
		expect(filtersOf(rate)).toStrictEqual({
			serviceName: 'frontend',
			name: ['HTTP GET /dispatch'],
			'deployment.environment': ['prod'],
		});
	});

	it('divide error spans by all spans from traces when span metrics are off', () => {
		const query = errorPercentage({ ...props, isSpanMetricEnable: false });
		const [errorSpans, allSpans] = query.queryData;

		expect(query.queryFormulas[0].expression).toBe('A*100/B');
		[errorSpans, allSpans].forEach((spans) => {
			expect(spans.dataSource).toBe(DataSource.TRACES);
			expect(spans.aggregateOperator).toBe('count');
		});
		expect(filtersOf(errorSpans)).toStrictEqual({
			serviceName: 'frontend',
			name: ['HTTP GET /dispatch'],
			hasError: true,
			'deployment.environment': ['prod'],
		});
		expect(filtersOf(allSpans)).toStrictEqual({
			serviceName: 'frontend',
			name: ['HTTP GET /dispatch'],
			'deployment.environment': ['prod'],
		});
	});

	it('keep the page filters on every apdex query from traces', () => {
		const apdex = apDexTracesQueryBuilderQueries({
			servicename: 'frontend',
			tagFilterItems: [env],
			topLevelOperationsRoute: ['HTTP GET /dispatch'],
			threashold: 0.5,
		});

		apdex.queryData.forEach((query) => {
			expect(query.dataSource).toBe(DataSource.TRACES);
			expect(filtersOf(query)).toMatchObject({
				serviceName: 'frontend',
				'deployment.environment': ['prod'],
			});
		});
	});
});
