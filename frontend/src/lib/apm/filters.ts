import { convertFiltersToExpression } from 'components/QueryBuilderV2/utils';
import { IResourceAttribute } from 'hooks/useResourceAttribute/types';
import { resourceAttributesToTracesFilterItems } from 'hooks/useResourceAttribute/utils';

/** The spans the services list and KPIs count as requests, as `/api/v2/services` does. */
export const entrySpansFilter = 'isRoot = true OR isEntryPoint = true';

export const errorSpansFilter = 'has_error = true';

export const okSpansFilter = 'has_error = false';

/** Span metrics mark failed calls with this `status.code`. */
export const metricErrorFilter = "status.code = 'STATUS_CODE_ERROR'";

export const metricOkFilter = "status.code != 'STATUS_CODE_ERROR'";

export function quote(value: string): string {
	return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

export const inList = (values: string[]): string =>
	`[${values.map(quote).join(', ')}]`;

export const serviceFilter = (servicename: string): string =>
	`service.name = ${quote(servicename)}`;

/** Clauses joined with AND; blank ones are skipped and ones using OR are grouped. */
export function allOf(...clauses: (string | undefined)[]): string {
	return clauses
		.filter((clause): clause is string => Boolean(clause?.trim()))
		.map((clause) => (/\sOR\s/i.test(clause) ? `(${clause})` : clause))
		.join(' AND ');
}

/** The page's resource attribute filter (environment and the rest) as an expression. */
export function resourceFilterExpression(
	queries: IResourceAttribute[],
): string {
	if (queries.length === 0) {
		return '';
	}
	return convertFiltersToExpression({
		items: resourceAttributesToTracesFilterItems(queries),
		op: 'AND',
	}).expression;
}

/**
 * Span metrics count every operation, so each service is scoped to its
 * top-level operations, as the per-service queries of the list always did.
 */
export function serviceOperationsFilter(
	topLevelOperations: [string, string[]][],
): string {
	return topLevelOperations
		.filter(([, operations]) => operations.length > 0)
		.map(
			([service, operations]) =>
				`(${serviceFilter(service)} AND operation IN ${inList(operations)})`,
		)
		.join(' OR ');
}
