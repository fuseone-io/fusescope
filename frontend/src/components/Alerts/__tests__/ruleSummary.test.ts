import type { RuletypesRuleDTO } from 'api/generated/services/fuseScope.schemas';

import { alertTypeLabel, describeRuleCondition } from '../ruleSummary';

function rule(overrides: Partial<RuletypesRuleDTO>): RuletypesRuleDTO {
	return {
		id: 'r1',
		alert: 'Rule',
		alertType: 'METRIC_BASED_ALERT',
		ruleType: 'threshold_rule',
		state: 'inactive',
		condition: { compositeQuery: {} },
		...overrides,
	} as RuletypesRuleDTO;
}

describe('describeRuleCondition', () => {
	it.each([
		[
			'v2 threshold with rolling window',
			rule({
				evaluation: {
					kind: 'rolling',
					spec: { evalWindow: '5m0s', frequency: '1m' },
				},
				condition: {
					compositeQuery: {},
					selectedQueryName: 'F1',
					thresholds: {
						kind: 'basic',
						spec: [
							{
								name: 'critical',
								target: 5,
								targetUnit: '',
								matchType: 'at_least_once',
								op: 'above',
							},
						],
					},
				},
			} as Partial<RuletypesRuleDTO>),
			'F1 > 5, at least once in 5m',
		],
		[
			'v2 with several thresholds counts the rest',
			rule({
				evaluation: { kind: 'rolling', spec: { evalWindow: '1h0m0s' } },
				condition: {
					compositeQuery: {},
					selectedQueryName: 'A',
					thresholds: {
						kind: 'basic',
						spec: [
							{ name: 'critical', target: 2, matchType: 'on_average', op: 'below' },
							{ name: 'warning', target: 1, matchType: 'on_average', op: 'below' },
						],
					},
				},
			} as Partial<RuletypesRuleDTO>),
			'A < 2, on average in 1h (+1 more)',
		],
		[
			'v1 numeric operator and match type',
			rule({
				evalWindow: '10m0s',
				condition: {
					compositeQuery: {},
					op: '1',
					target: 90,
					matchType: '2',
				},
			} as unknown as Partial<RuletypesRuleDTO>),
			'> 90, all the time in 10m',
		],
		['no threshold at all', rule({}), ''],
	])('%s', (_name, input, expected) => {
		expect(describeRuleCondition(input)).toBe(expected);
	});
});

describe('alertTypeLabel', () => {
	it.each([
		['METRIC_BASED_ALERT', 'threshold_rule', 'Metric-based'],
		['LOGS_BASED_ALERT', 'threshold_rule', 'Log-based'],
		['TRACES_BASED_ALERT', 'threshold_rule', 'Trace-based'],
		['EXCEPTIONS_BASED_ALERT', 'threshold_rule', 'Exceptions-based'],
		['METRIC_BASED_ALERT', 'anomaly_rule', 'Anomaly-based'],
		['UNKNOWN', 'threshold_rule', ''],
	])('%s / %s', (alertType, ruleType, expected) => {
		expect(
			alertTypeLabel(
				rule({ alertType, ruleType } as unknown as Partial<RuletypesRuleDTO>),
			),
		).toBe(expected);
	});
});
