import { QueryParams } from 'constants/query';
import {
	INITIAL_ADVANCED_OPTIONS_STATE,
	INITIAL_ALERT_STATE,
	INITIAL_ALERT_THRESHOLD_STATE,
	INITIAL_EVALUATION_WINDOW_STATE,
	INITIAL_NOTIFICATION_SETTINGS_STATE,
} from 'container/CreateAlertV2/context/constants';
import { resolveUrlAlertPrefill } from 'container/CreateAlertV2/context/resolveUrlAlertPrefill';
import {
	AlertThresholdMatchType,
	AlertThresholdOperator,
} from 'container/CreateAlertV2/context/types';
import { buildCreateThresholdAlertRulePayload } from 'container/CreateAlertV2/Footer/utils';
import { AlertTypes } from 'types/api/alerts/alertTypes';

import {
	buildRumAlertPrefill,
	rumAlertTemplateFromUrl,
	rumAlertUrl,
} from '../alertTemplates';
import { RumAlertTarget, RumAlertTemplateId } from '../alertTemplateTypes';

const APP = 'app-1';
const SHOP = { applicationId: APP, applicationName: 'shop' };
const VITAL = "attribute.event.name = 'browser.web_vital'";
const EXCEPTION = "attribute.event.name = 'exception'";
const IN_APP = `fusescope.rum.application.id = '${APP}'`;
const ROUTE_KEY = 'fusescope.rum.view.route';

function payloadFor(
	template: RumAlertTemplateId,
	target: RumAlertTarget,
): ReturnType<typeof buildCreateThresholdAlertRulePayload> {
	const prefill = buildRumAlertPrefill(template, target);
	return buildCreateThresholdAlertRulePayload({
		alertType: AlertTypes.LOGS_BASED_ALERT,
		basicAlertState: {
			...INITIAL_ALERT_STATE,
			name: prefill.ruleName,
			yAxisUnit: prefill.unit,
		},
		thresholdState: {
			...INITIAL_ALERT_THRESHOLD_STATE,
			selectedQuery: prefill.selectedQuery,
			matchType: prefill.matchType,
			operator: prefill.operator,
			thresholds: prefill.thresholds,
		},
		advancedOptions: INITIAL_ADVANCED_OPTIONS_STATE,
		evaluationWindow: INITIAL_EVALUATION_WINDOW_STATE,
		notificationSettings: INITIAL_NOTIFICATION_SETTINGS_STATE,
		query: prefill.query,
	});
}

const logsQuery = (
	name: string,
	filter: string,
	aggregation: string,
	groupBy: { name: string; fieldContext: string }[] = [],
): unknown => ({
	type: 'builder_query',
	spec: expect.objectContaining({
		name,
		signal: 'logs',
		disabled: false,
		filter: { expression: filter },
		aggregations: [{ expression: aggregation }],
		groupBy:
			groupBy.length > 0
				? groupBy.map((key) => expect.objectContaining(key))
				: undefined,
	}),
});

describe('buildRumAlertPrefill payloads', () => {
	it.each<{
		name: string;
		template: RumAlertTemplateId;
		target: RumAlertTarget;
		alert: string;
		unit: string | undefined;
		queries: unknown[];
		selectedQueryName: string;
		threshold: { target: number; matchType: string; targetUnit: string };
	}>([
		{
			name: 'lcp p75 per route',
			template: 'lcp_p75',
			target: { ...SHOP, groupBy: 'route' },
			alert: 'shop LCP p75 above 2.5 s',
			unit: 'ms',
			queries: [
				logsQuery(
					'A',
					`${VITAL} AND browser.web_vital.name = 'lcp' AND ${IN_APP}`,
					'p75(browser.web_vital.value)',
					[{ name: ROUTE_KEY, fieldContext: 'attribute' }],
				),
			],
			selectedQueryName: 'A',
			threshold: { target: 2500, matchType: 'all_the_times', targetUnit: 'ms' },
		},
		{
			name: 'lcp p75 on one route',
			template: 'lcp_p75',
			target: { ...SHOP, route: '/product/:id' },
			alert: 'shop LCP p75 above 2.5 s on /product/:id',
			unit: 'ms',
			queries: [
				logsQuery(
					'A',
					`${VITAL} AND browser.web_vital.name = 'lcp' AND ${IN_APP} AND ${ROUTE_KEY} = '/product/:id'`,
					'p75(browser.web_vital.value)',
				),
			],
			selectedQueryName: 'A',
			threshold: { target: 2500, matchType: 'all_the_times', targetUnit: 'ms' },
		},
		{
			name: 'session error rate',
			template: 'session_error_rate',
			target: SHOP,
			alert: 'shop session error rate above 5%',
			unit: '%',
			queries: [
				logsQuery('A', `${IN_APP} AND ${EXCEPTION}`, 'count_distinct(session.id)'),
				logsQuery('B', IN_APP, 'count_distinct(session.id)'),
				{
					type: 'builder_formula',
					spec: expect.objectContaining({
						name: 'F1',
						expression: 'A / B * 100',
						disabled: false,
					}),
				},
			],
			selectedQueryName: 'F1',
			threshold: { target: 5, matchType: 'at_least_once', targetUnit: '%' },
		},
		{
			name: 'js error count per release',
			template: 'js_error_count',
			target: { ...SHOP, groupBy: 'release' },
			alert: 'shop JS errors above 10',
			unit: undefined,
			queries: [
				logsQuery('A', `${IN_APP} AND ${EXCEPTION}`, 'count()', [
					{ name: 'service.version', fieldContext: 'resource' },
				]),
			],
			selectedQueryName: 'A',
			threshold: { target: 10, matchType: 'in_total', targetUnit: '' },
		},
		{
			name: 'js error count of one error on one route',
			template: 'js_error_count',
			target: {
				...SHOP,
				route: '/cart',
				error: { type: 'TypeError', message: "can't read 'price'" },
			},
			alert: 'shop TypeError above 10 on /cart',
			unit: undefined,
			queries: [
				logsQuery(
					'A',
					`${IN_APP} AND ${EXCEPTION} AND ${ROUTE_KEY} = '/cart' AND exception.type = 'TypeError' AND exception.message = 'can\\'t read \\'price\\''`,
					'count()',
				),
			],
			selectedQueryName: 'A',
			threshold: { target: 10, matchType: 'in_total', targetUnit: '' },
		},
	])(
		'$name',
		({
			template,
			target,
			alert,
			unit,
			queries,
			selectedQueryName,
			threshold,
		}) => {
			const payload = payloadFor(template, target);

			expect(payload.alert).toBe(alert);
			expect(payload.alertType).toBe(AlertTypes.LOGS_BASED_ALERT);
			expect(payload.ruleType).toBe('threshold_rule');
			expect(payload.condition.compositeQuery.queryType).toBe('builder');
			expect(payload.condition.compositeQuery.unit).toBe(unit);
			expect(payload.condition.compositeQuery.queries).toStrictEqual(queries);
			expect(payload.condition.selectedQueryName).toBe(selectedQueryName);
			expect(payload.condition.thresholds?.spec).toStrictEqual([
				{
					name: 'critical',
					target: threshold.target,
					matchType: threshold.matchType,
					op: 'above',
					channels: [],
					targetUnit: threshold.targetUnit,
				},
			]);
		},
	);
});

describe('rumAlertUrl', () => {
	it('declares the whole prefill for the alert editor', () => {
		const target = { ...SHOP, route: '/cart' };
		const prefill = buildRumAlertPrefill('session_error_rate', target);
		const url = new URL(rumAlertUrl('session_error_rate', target), 'http://x');
		const params = url.searchParams;

		expect(url.pathname).toBe('/alerts/new');
		expect(params.get(QueryParams.alertType)).toBe(AlertTypes.LOGS_BASED_ALERT);
		expect(params.get(QueryParams.ruleType)).toBe('threshold_rule');
		expect(params.get(QueryParams.ruleName)).toBe(prefill.ruleName);
		expect(params.get(QueryParams.yAxisUnit)).toBe('%');
		expect(
			JSON.parse(decodeURIComponent(params.get(QueryParams.compositeQuery) ?? '')),
		).toStrictEqual({ ...prefill.query, id: expect.any(String) });
		expect(resolveUrlAlertPrefill(params)).toStrictEqual({
			thresholds: prefill.thresholds.map((threshold) => ({
				...threshold,
				id: expect.any(String),
			})),
			matchType: AlertThresholdMatchType.AT_LEAST_ONCE,
			operator: AlertThresholdOperator.IS_ABOVE,
			selectedQuery: 'F1',
			evaluationWindowPreset: undefined,
		});
		expect(rumAlertTemplateFromUrl(params)).toStrictEqual({
			template: 'session_error_rate',
			applicationId: APP,
		});
	});

	it('gives each build a new query id, so the editor reloads the query', () => {
		const first = buildRumAlertPrefill('lcp_p75', SHOP);
		const second = buildRumAlertPrefill('lcp_p75', SHOP);
		expect(first.query.id).not.toBe(second.query.id);
	});

	it.each([
		['', undefined],
		['rumTemplate=lcp_p75', undefined],
		['rumTemplate=nope&rumApplication=a', undefined],
		['rumTemplate=__proto__&rumApplication=a', undefined],
		[
			'rumTemplate=js_error_count&rumApplication=a',
			{ template: 'js_error_count', applicationId: 'a' },
		],
	])('reads the template from %p', (search, expected) => {
		expect(rumAlertTemplateFromUrl(new URLSearchParams(search))).toStrictEqual(
			expected,
		);
	});
});
