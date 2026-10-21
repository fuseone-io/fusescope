import { isKeyMatch } from 'components/QuickFilters/FilterRenderers/Checkbox/utils';
import { Query, TagFilterItem } from 'types/api/queryBuilder/queryBuilderData';

const EXCLUDING_OPERATORS = new Set(['!=', 'not in', 'nin', 'not_in']);

const LABELS: Record<string, string> = {
	'gen_ai.request.model': 'Model',
	'gen_ai.provider.name': 'Provider',
	'gen_ai.operation.name': 'Operation',
	'gen_ai.agent.name': 'Agent',
	'gen_ai.tool.name': 'Tool',
	'service.name': 'Service',
	'deployment.environment': 'Environment',
	'deployment.environment.name': 'Environment',
};

/** A short name for the well-known AI keys; others keep their title. */
export function quickFilterLabel(attributeKey: string, title: string): string {
	return LABELS[attributeKey] ?? title;
}

/**
 * What a filter's button says: "All", "2 selected" or "1 excluded"; a range
 * filter only says whether it is set.
 */
export function quickFilterSummary(
	items: TagFilterItem[],
	attributeKey: string,
	kind: 'values' | 'range' = 'values',
): string {
	const clauses = items.filter((entry) =>
		isKeyMatch(entry.key?.key, attributeKey),
	);
	if (clauses.length === 0) {
		return 'All';
	}
	if (kind === 'range') {
		return 'Filtered';
	}

	const count = clauses.reduce(
		(sum, entry) => sum + (Array.isArray(entry.value) ? entry.value.length : 1),
		0,
	);
	const excluding = clauses.every((entry) =>
		EXCLUDING_OPERATORS.has(entry.op.toLowerCase()),
	);
	return `${count} ${excluding ? 'excluded' : 'selected'}`;
}

/** The query with every filter of the query at `index` removed. */
export function clearQueryFilters(query: Query, index: number): Query {
	if (!query.builder.queryData[index]) {
		return query;
	}

	return {
		...query,
		builder: {
			...query.builder,
			queryData: query.builder.queryData.map((entry, position) =>
				position === index
					? {
							...entry,
							filter: { ...entry.filter, expression: '' },
							filters: { ...entry.filters, items: [], op: entry.filters?.op || 'AND' },
						}
					: entry,
			),
		},
	};
}
