import { useCallback } from 'react';
import {
	IQuickFiltersConfig,
	QuickFilterChangeEventData,
} from 'components/QuickFilters/types';
import { useQueryBuilder } from 'hooks/queryBuilder/useQueryBuilder';
import { isFunction } from 'lodash-es';
import { Query } from 'types/api/queryBuilder/queryBuilderData';
import { NormalizedSeverity } from 'utils/logSeverity';

import {
	applySeverityLevels,
	withoutSeverityItems,
} from './severityFilterQuery';

interface UseSeverityFilterActionsProps {
	filter: IQuickFiltersConfig;
	queryIndex: number;
	onFilterChange?: ((query: Query) => void) | null;
	onQuickFilterChange?: (data: QuickFilterChangeEventData) => void;
}

/** Writes a level selection into the query, replacing any severity_text clause. */
export function useSeverityFilterActions({
	filter,
	queryIndex,
	onFilterChange,
	onQuickFilterChange,
}: UseSeverityFilterActionsProps): (
	levels: NormalizedSeverity[] | null,
) => void {
	const { currentQuery, redirectWithQueryBuilderData } = useQueryBuilder();

	return useCallback(
		(levels: NormalizedSeverity[] | null): void => {
			const queryData = currentQuery.builder.queryData.map((data, index) => {
				if (index !== queryIndex) {
					return data;
				}
				return {
					...data,
					filter: {
						...data.filter,
						expression: applySeverityLevels(data.filter?.expression || '', levels),
					},
					filters: {
						op: data.filters?.op || 'AND',
						items: withoutSeverityItems(data.filters?.items || []),
					},
				};
			});
			const query: Query = {
				...currentQuery,
				builder: { ...currentQuery.builder, queryData },
			};

			if (onFilterChange && isFunction(onFilterChange)) {
				onFilterChange(query);
			} else {
				redirectWithQueryBuilderData(query);
			}

			onQuickFilterChange?.({
				filterKey: filter.attributeKey.key,
				expression: queryData[queryIndex]?.filter?.expression || '',
				filterItemKeys: (queryData[queryIndex]?.filters?.items || [])
					.map((item) => item.key?.key)
					.filter((key): key is string => !!key),
			});
		},
		[
			currentQuery,
			queryIndex,
			onFilterChange,
			onQuickFilterChange,
			redirectWithQueryBuilderData,
			filter.attributeKey.key,
		],
	);
}
