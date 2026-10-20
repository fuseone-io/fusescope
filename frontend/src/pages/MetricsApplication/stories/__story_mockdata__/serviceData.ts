/**
 * AI-owned. Generated and maintained by the `signoz-page-story` skill.
 * Do not hand-edit: regenerate instead.
 */

import type { RuletypesRuleDTO } from 'api/generated/services/fuseScope.schemas';
import type { Exception } from 'types/api/errors/getAll';

import { SERVICE_NAME } from './metricsApplication';

const EDGE = { callCount: 1300, p50: 2.1e7, p75: 3e7, p90: 4.1e7, p95: 5e7 };

/** The dependency graph around the service: one caller, a service, a database and a failing callee. */
export const dependencyGraphResponse = (): unknown[] => [
	{
		...EDGE,
		parent: 'frontend',
		child: SERVICE_NAME,
		callRate: 2.4,
		errorRate: 1.9,
		p99: 6.1e8,
	},
	{
		...EDGE,
		parent: SERVICE_NAME,
		child: 'cart',
		callRate: 2.4,
		errorRate: 0,
		p99: 8.2e7,
	},
	{
		...EDGE,
		parent: SERVICE_NAME,
		child: 'postgresql',
		callRate: 4.8,
		errorRate: 0,
		p99: 3.1e7,
	},
	{
		...EDGE,
		parent: SERVICE_NAME,
		child: 'payment',
		callRate: 1.2,
		errorRate: 100,
		p99: 5.9e7,
	},
];

export const exceptionsResponse = (count: number): Exception[] =>
	[
		['*errors.errorString', 'payment declined: card expired'],
		['java.net.SocketTimeoutException', 'Read timed out'],
		['context.deadlineExceededError', 'context deadline exceeded'],
	]
		.slice(0, count)
		.map(([exceptionType, exceptionMessage], index) => ({
			exceptionType,
			exceptionMessage,
			exceptionCount: 1585 - index * 400,
			lastSeen: '2025-01-01T10:44:58Z',
			firstSeen: '2024-12-30T08:02:00Z',
			serviceName: SERVICE_NAME,
			groupID: `group-${index}`,
		}));

/** Alert rules: one scoped to the service through its filter, one through a label, one elsewhere. */
export const rulesResponse = (): {
	status: string;
	data: RuletypesRuleDTO[];
} => {
	const rule = (
		id: string,
		alert: string,
		state: string,
		expression: string,
		labels: Record<string, string> = {},
	): RuletypesRuleDTO =>
		({
			id,
			alert,
			state,
			labels,
			alertType: 'TRACES_BASED_ALERT',
			ruleType: 'threshold_rule',
			condition: {
				compositeQuery: {
					queryType: 'builder',
					panelType: 'graph',
					queries: [
						{ type: 'builder_query', spec: { name: 'A', filter: { expression } } },
					],
				},
			},
		}) as unknown as RuletypesRuleDTO;
	return {
		status: 'success',
		data: [
			rule(
				'r1',
				`${SERVICE_NAME} p99 latency above 1 s`,
				'firing',
				`service.name = '${SERVICE_NAME}'`,
			),
			rule('r2', `${SERVICE_NAME} error rate above 5%`, 'inactive', '', {
				'service.name': SERVICE_NAME,
			}),
			rule('r3', 'cart error rate', 'inactive', "service.name = 'cart'"),
		],
	};
};
