import { UniversalYAxisUnit } from 'components/YAxisUnitSelector/types';
import { ENTITY_VERSION_V5 } from 'constants/app';
import { QueryParams } from 'constants/query';
import {
	initialFormulaBuilderFormValues,
	initialQueriesMap,
	initialQueryBuilderFormValuesMap,
} from 'constants/queryBuilder';
import ROUTES from 'constants/routes';
import { AlertDetectionTypes } from 'container/FormAlertRules';
import { INITIAL_CRITICAL_THRESHOLD } from 'container/CreateAlertV2/context/constants';
import {
	AlertThresholdMatchType,
	AlertThresholdOperator,
} from 'container/CreateAlertV2/context/types';
import { allOf, quote } from 'lib/apm/filters';
import { AlertTypes } from 'types/api/alerts/alertTypes';
import { DataTypes } from 'types/api/queryBuilder/queryAutocompleteResponse';
import { IBuilderQuery, Query } from 'types/api/queryBuilder/queryBuilderData';
import { v4 as uuid } from 'uuid';

import {
	RumAlertGroupBy,
	RumAlertPrefill,
	RumAlertTarget,
	RumAlertTemplateId,
	RumAlertTemplateRef,
} from './alertTemplateTypes';
import {
	applicationFilter,
	exceptionEventsFilter,
	RUM_ATTRIBUTES,
	webVitalEventsFilter,
} from './attributes';

export const RUM_ALERT_TEMPLATES: RumAlertTemplateId[] = [
	'lcp_p75',
	'session_error_rate',
	'js_error_count',
];

export const RUM_ALERT_DEFAULTS: Record<RumAlertTemplateId, number> = {
	lcp_p75: 2500,
	session_error_rate: 5,
	js_error_count: 10,
};

const SESSIONS = `count_distinct(${RUM_ATTRIBUTES.sessionId})`;

const GROUP_BY_KEYS: Record<RumAlertGroupBy, IBuilderQuery['groupBy'][number]> =
	{
		route: {
			key: RUM_ATTRIBUTES.route,
			dataType: DataTypes.String,
			type: 'attribute',
		},
		release: {
			key: RUM_ATTRIBUTES.serviceVersion,
			dataType: DataTypes.String,
			type: 'resource',
		},
	};

const routeFilter = (route?: string): string =>
	route ? `${RUM_ATTRIBUTES.route} = ${quote(route)}` : '';

const onRoute = (route?: string): string => (route ? ` on ${route}` : '');

function logsQuery(
	queryName: string,
	filter: string,
	aggregation: string,
	groupBy?: RumAlertGroupBy,
): IBuilderQuery {
	return {
		...initialQueryBuilderFormValuesMap.logs,
		queryName,
		expression: queryName,
		filter: { expression: filter },
		aggregations: [{ expression: aggregation }],
		groupBy: groupBy ? [GROUP_BY_KEYS[groupBy]] : [],
	};
}

function builderQuery(
	queryData: IBuilderQuery[],
	formula?: { name: string; expression: string },
): Query {
	return {
		...initialQueriesMap.logs,
		id: uuid(),
		builder: {
			...initialQueriesMap.logs.builder,
			queryData,
			queryFormulas: formula
				? [
						{
							...initialFormulaBuilderFormValues,
							queryName: formula.name,
							expression: formula.expression,
						},
					]
				: [],
		},
	};
}

function threshold(value: number, unit = ''): RumAlertPrefill['thresholds'] {
	return [
		{ ...INITIAL_CRITICAL_THRESHOLD, id: uuid(), thresholdValue: value, unit },
	];
}

function lcpP75(target: RumAlertTarget): RumAlertPrefill {
	const value = RUM_ALERT_DEFAULTS.lcp_p75;
	return {
		template: 'lcp_p75',
		ruleName: `${target.applicationName} LCP p75 above ${value / 1000} s${onRoute(target.route)}`,
		query: builderQuery([
			logsQuery(
				'A',
				allOf(
					webVitalEventsFilter,
					`${RUM_ATTRIBUTES.vitalName} = ${quote('lcp')}`,
					applicationFilter(target.applicationId),
					routeFilter(target.route),
				),
				`p75(${RUM_ATTRIBUTES.vitalValue})`,
				target.groupBy,
			),
		]),
		unit: UniversalYAxisUnit.MILLISECONDS,
		selectedQuery: 'A',
		matchType: AlertThresholdMatchType.ALL_THE_TIME,
		operator: AlertThresholdOperator.IS_ABOVE,
		thresholds: threshold(value, UniversalYAxisUnit.MILLISECONDS),
	};
}

function sessionErrorRate(target: RumAlertTarget): RumAlertPrefill {
	const value = RUM_ALERT_DEFAULTS.session_error_rate;
	const app = allOf(
		applicationFilter(target.applicationId),
		routeFilter(target.route),
	);
	return {
		template: 'session_error_rate',
		ruleName: `${target.applicationName} session error rate above ${value}%${onRoute(target.route)}`,
		query: builderQuery(
			[
				logsQuery('A', allOf(app, exceptionEventsFilter), SESSIONS, target.groupBy),
				logsQuery('B', app, SESSIONS, target.groupBy),
			],
			{ name: 'F1', expression: 'A / B * 100' },
		),
		unit: UniversalYAxisUnit.PERCENT,
		selectedQuery: 'F1',
		matchType: AlertThresholdMatchType.AT_LEAST_ONCE,
		operator: AlertThresholdOperator.IS_ABOVE,
		thresholds: threshold(value, UniversalYAxisUnit.PERCENT),
	};
}

function jsErrorCount(target: RumAlertTarget): RumAlertPrefill {
	const value = RUM_ALERT_DEFAULTS.js_error_count;
	const { error } = target;
	const subject = error?.type || 'JS errors';
	return {
		template: 'js_error_count',
		ruleName: `${target.applicationName} ${subject} above ${value}${onRoute(target.route)}`,
		query: builderQuery([
			logsQuery(
				'A',
				allOf(
					applicationFilter(target.applicationId),
					exceptionEventsFilter,
					routeFilter(target.route),
					error ? `${RUM_ATTRIBUTES.exceptionType} = ${quote(error.type)}` : '',
					error?.message
						? `${RUM_ATTRIBUTES.exceptionMessage} = ${quote(error.message)}`
						: '',
				),
				'count()',
				target.groupBy,
			),
		]),
		selectedQuery: 'A',
		matchType: AlertThresholdMatchType.IN_TOTAL,
		operator: AlertThresholdOperator.IS_ABOVE,
		thresholds: threshold(value),
	};
}

const BUILDERS: Record<
	RumAlertTemplateId,
	(target: RumAlertTarget) => RumAlertPrefill
> = {
	lcp_p75: lcpP75,
	session_error_rate: sessionErrorRate,
	js_error_count: jsErrorCount,
};

export const buildRumAlertPrefill = (
	template: RumAlertTemplateId,
	target: RumAlertTarget,
): RumAlertPrefill => BUILDERS[template](target);

/** The alert editor with the template's query, condition and name filled in. */
export function rumAlertUrl(
	template: RumAlertTemplateId,
	target: RumAlertTarget,
): string {
	const prefill = buildRumAlertPrefill(template, target);
	const params = new URLSearchParams();
	params.set(QueryParams.alertType, AlertTypes.LOGS_BASED_ALERT);
	params.set(QueryParams.ruleType, AlertDetectionTypes.THRESHOLD_ALERT);
	params.set(QueryParams.version, ENTITY_VERSION_V5);
	params.set(
		QueryParams.compositeQuery,
		encodeURIComponent(JSON.stringify(prefill.query)),
	);
	params.set(QueryParams.ruleName, prefill.ruleName);
	if (prefill.unit) {
		params.set(QueryParams.yAxisUnit, prefill.unit);
	}
	// Raw JSON: URLSearchParams encodes once; the editor uses a bare JSON.parse.
	params.set(QueryParams.thresholds, JSON.stringify(prefill.thresholds));
	params.set(QueryParams.matchType, prefill.matchType);
	params.set(QueryParams.compareOp, prefill.operator);
	params.set(QueryParams.selectedQuery, prefill.selectedQuery);
	params.set(QueryParams.rumTemplate, template);
	params.set(QueryParams.rumApplication, target.applicationId);
	return `${ROUTES.ALERTS_NEW}?${params.toString()}`;
}

const isTemplateId = (value: string | null): value is RumAlertTemplateId =>
	RUM_ALERT_TEMPLATES.some((template) => template === value);

/** The template an editor URL was built from, if any. */
export function rumAlertTemplateFromUrl(
	params: URLSearchParams,
): RumAlertTemplateRef | undefined {
	const template = params.get(QueryParams.rumTemplate);
	const applicationId = params.get(QueryParams.rumApplication);
	if (!isTemplateId(template) || !applicationId) {
		return undefined;
	}
	return { template, applicationId };
}
