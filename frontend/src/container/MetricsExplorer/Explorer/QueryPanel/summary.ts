import {
	IBuilderFormula,
	IBuilderQuery,
} from 'types/api/queryBuilder/queryBuilderData';
import { MetricAggregation } from 'types/api/v5/queryRange';
import { pluralize } from 'utils/pluralize';

export interface SummaryOption {
	key: string;
	value: string;
}

export interface QuerySummary {
	metric: string;
	metricType: string;
	where: string;
	overTime: string;
	across: string;
	options: SummaryOption[];
	/** A read-only PromQL-like reading, e.g. `rate(m[60s]) · sum by k`. */
	promql: string;
}

export interface FormulaSummary {
	expression: string;
	options: SummaryOption[];
}

function orderByText(query: IBuilderQuery): string {
	return (query.orderBy ?? [])
		.map((item) => `${item.columnName} ${item.order}`.trim())
		.join(', ');
}

/** The set options of a query or formula, as `key = value` chips. */
function optionsOf(
	query: Pick<IBuilderQuery, 'having' | 'orderBy' | 'limit' | 'legend'>,
): SummaryOption[] {
	const having =
		query.having && !Array.isArray(query.having)
			? query.having.expression?.trim()
			: '';
	const orderBy = orderByText(query as IBuilderQuery);
	return [
		{ key: 'having', value: having ?? '' },
		{ key: 'order by', value: orderBy },
		{ key: 'limit', value: query.limit ? String(query.limit) : '' },
		{ key: 'legend', value: query.legend?.trim() ?? '' },
	].filter((option) => option.value);
}

export function summarizeQuery(query: IBuilderQuery): QuerySummary {
	const aggregation = query.aggregations?.[0] as MetricAggregation | undefined;
	const metric = query.aggregateAttribute?.key || aggregation?.metricName || '';
	const time = query.timeAggregation || aggregation?.timeAggregation || '';
	const space = query.spaceAggregation || aggregation?.spaceAggregation || '';
	const step = query.stepInterval ? `${query.stepInterval}s` : 'auto';
	const keys = (query.groupBy ?? []).map((item) => item.key).join(', ');
	const where = query.filter?.expression?.trim() ?? '';
	const across = keys ? `${space} by ${keys}` : space;
	const selector = where ? `{${where}}` : '';

	return {
		metric,
		metricType: String(query.aggregateAttribute?.type ?? ''),
		where,
		overTime: `${time} · ${step}`,
		across,
		options: optionsOf(query),
		promql: metric ? `${time}(${metric}${selector}[${step}]) · ${across}` : '',
	};
}

export function summarizeFormula(formula: IBuilderFormula): FormulaSummary {
	return {
		expression: formula.expression,
		options: optionsOf(formula as unknown as IBuilderQuery),
	};
}

/** "2 queries · 1 formula". */
export function countLabel(queries: number, formulas: number): string {
	const parts = [pluralize(queries, 'query', 'queries')];
	if (formulas) {
		parts.push(pluralize(formulas, 'formula'));
	}
	return parts.join(' · ');
}

/** A collapsed card's one-line reading. */
export function cardSummary(summary: QuerySummary): string {
	return [
		summary.overTime,
		summary.across,
		summary.where ? `where ${summary.where}` : '',
		...summary.options.map((option) => `${option.key} ${option.value}`),
	]
		.filter(Boolean)
		.join(' · ');
}
