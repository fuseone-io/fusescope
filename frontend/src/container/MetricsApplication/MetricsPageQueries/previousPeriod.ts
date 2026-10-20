import { alphabet } from 'constants/queryBuilder';
import {
	IBuilderFormula,
	IBuilderQuery,
} from 'types/api/queryBuilder/queryBuilderData';
import { QueryFunction } from 'types/api/v5/queryRange';
import { QueryBuilderData } from 'types/common/queryBuilder';

export const PREVIOUS_PERIOD_SUFFIX = ', previous period';

/**
 * `/api/v4/query_range` reads the shift as a bare number; the builder types
 * model v5's `{ value }` arguments, which v4 rejects.
 */
const timeShift = (seconds: number): QueryFunction =>
	({ name: 'timeShift', args: [seconds] }) as unknown as QueryFunction;

interface PreviousPeriodOptions {
	/** Copy only the enabled series with these legends; formulas copy everything. */
	legends?: string[];
}

interface PreviousPeriod {
	builder: QueryBuilderData;
	/** The copies to draw dashed. */
	dashedQueryNames: string[];
}

function renameReferences(
	expression: string,
	names: Map<string, string>,
): string {
	return expression.replace(/\b[A-Z]\b/g, (name) => names.get(name) ?? name);
}

/**
 * The chart's queries plus copies shifted back by the window, so the previous
 * period draws over the current one.
 */
export function withPreviousPeriod(
	builder: QueryBuilderData,
	shiftSeconds: number,
	{ legends }: PreviousPeriodOptions = {},
): PreviousPeriod {
	if (!shiftSeconds) {
		return { builder, dashedQueryNames: [] };
	}
	const hasFormulas = builder.queryFormulas.length > 0;
	const used = new Set(builder.queryData.map((query) => query.queryName));
	const names = new Map<string, string>();
	const selected = builder.queryData.filter(
		(query) =>
			hasFormulas ||
			(!query.disabled && (!legends || legends.includes(query.legend))),
	);

	const queries: IBuilderQuery[] = selected.map((query) => {
		const name = alphabet.find((letter) => !used.has(letter)) ?? query.queryName;
		used.add(name);
		names.set(query.queryName, name);
		return {
			...query,
			queryName: name,
			expression: name,
			legend: query.disabled
				? query.legend
				: `${query.legend}${PREVIOUS_PERIOD_SUFFIX}`,
			functions: [...(query.functions ?? []), timeShift(shiftSeconds)],
		};
	});

	const formulas: IBuilderFormula[] = builder.queryFormulas.map(
		(formula, index) => ({
			...formula,
			queryName: `F${builder.queryFormulas.length + index + 1}`,
			expression: renameReferences(formula.expression, names),
			legend: `${formula.legend}${PREVIOUS_PERIOD_SUFFIX}`,
		}),
	);

	return {
		builder: {
			...builder,
			queryData: [...builder.queryData, ...queries],
			queryFormulas: [...builder.queryFormulas, ...formulas],
		},
		dashedQueryNames: [
			...queries
				.filter((query) => !query.disabled)
				.map((query) => query.queryName),
			...formulas.map((formula) => formula.queryName),
		],
	};
}
