import {
	IBuilderFormula,
	IBuilderQuery,
} from 'types/api/queryBuilder/queryBuilderData';
import { metricQueryFunctionOptions } from 'constants/queryFunctionOptions';
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

/** The Aggregation section's reading: `rate · 60s · sum by service.name`. */
export function aggregationSummary(query: IBuilderQuery): string {
	const { overTime, across } = summarizeQuery(query);
	const breakdown = query.groupBy?.length ? across : `${across} · no breakdown`;
	return `${overTime} · ${breakdown}`;
}

const functionLabels = new Map(
	metricQueryFunctionOptions.map((option) => [option.value, option.label]),
);

/** The Functions section's reading: `EWMA 5 → Clamp Max 100`, or None. */
export function functionsSummary(query: IBuilderQuery): string {
	const functions = query.functions ?? [];
	if (!functions.length) {
		return 'None';
	}
	return functions
		.map((fn) => {
			const args = ((fn.args ?? []) as unknown[])
				.map((arg) =>
					arg && typeof arg === 'object' ? (arg as { value: unknown }).value : arg,
				)
				.filter((value) => value !== '' && value !== undefined && value !== null);
			return [functionLabels.get(fn.name) ?? fn.name, ...args].join(' ');
		})
		.join(' → ');
}

/** The Result section's reading, the set options only, or Defaults. */
export function resultSummary(item: IBuilderQuery | IBuilderFormula): string {
	const options = new Map(
		optionsOf(item as IBuilderQuery).map((option) => [option.key, option.value]),
	);
	const parts = [
		options.has('limit') ? `limit ${options.get('limit')}` : '',
		options.has('order by') ? `order by ${options.get('order by')}` : '',
		options.has('having') ? `having ${options.get('having')}` : '',
		options.has('legend') ? 'legend' : '',
	].filter(Boolean);
	return parts.length ? parts.join(' · ') : 'Defaults';
}
