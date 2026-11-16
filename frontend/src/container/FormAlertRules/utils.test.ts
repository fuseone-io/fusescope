// Write a test for getUpdatedStepInterval function in src/container/FormAlertRules/utils.ts

import { initialQueriesMap } from 'constants/queryBuilder';
import { EQueryType } from 'types/common/dashboard';
import { DataSource } from 'types/common/queryBuilder';

import { convertBuilderQueriesToV5 } from 'api/v5/queryRange/prepareQueryRangePayloadV5';

import {
	anomalyFunction,
	getQueryNames,
	getUpdatedStepInterval,
} from './utils';

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

describe('anomalyFunction', () => {
	it('names both arguments, defaulting the target and the seasonality', () => {
		expect(anomalyFunction(undefined, undefined)).toStrictEqual({
			name: 'anomaly',
			namedArgs: { z_score_threshold: 3, seasonality: 'hourly' },
		});
		expect(anomalyFunction(5, 'daily')).toStrictEqual({
			name: 'anomaly',
			namedArgs: { z_score_threshold: 5, seasonality: 'daily' },
		});
	});

	it('reaches the v5 payload with named arguments', () => {
		const [envelope] = convertBuilderQueriesToV5(
			{
				A: {
					...initialQueriesMap.metrics.builder.queryData[0],
					dataSource: DataSource.METRICS,
					functions: [anomalyFunction(4, 'weekly')],
				},
			},
			'time_series',
		);
		const spec = envelope.spec as { functions?: unknown };
		expect(spec.functions).toStrictEqual([
			{
				name: 'anomaly',
				args: [
					{ name: 'z_score_threshold', value: 4 },
					{ name: 'seasonality', value: 'weekly' },
				],
			},
		]);
	});
});
