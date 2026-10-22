// Write a test for getUpdatedStepInterval function in src/container/FormAlertRules/utils.ts

import { initialQueriesMap } from 'constants/queryBuilder';
import { EQueryType } from 'types/common/dashboard';
import { DataSource } from 'types/common/queryBuilder';

import { getQueryNames, getUpdatedStepInterval } from './utils';

describe('getUpdatedStepInterval', () => {
	it('should return 60', () => {
		const result = getUpdatedStepInterval('5m0s');
		expect(result).toBe(60);
	});
	it('should return 60 for 10m0s', () => {
		const result = getUpdatedStepInterval('10m0s');
		expect(result).toBe(60);
	});
});

describe('getQueryNames', () => {
	const metricsQuery = initialQueriesMap[DataSource.METRICS];

	it('lists the builder query names', () => {
		expect(getQueryNames(metricsQuery)).toStrictEqual([
			{ label: 'A', value: 'A' },
		]);
	});

	it.each(['constructor', 'toString', '__proto__', 'unknown'])(
		'returns no options for the query type %s',
		(queryType) => {
			const query = { ...metricsQuery, queryType: queryType as EQueryType };

			expect(getQueryNames(query)).toStrictEqual([]);
		},
	);
});
