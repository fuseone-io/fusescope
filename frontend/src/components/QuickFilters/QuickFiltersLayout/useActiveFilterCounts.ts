import { useMemo } from 'react';
import { useGetCompositeQueryParam } from 'hooks/queryBuilder/useGetCompositeQueryParam';

import { isKeyMatch } from '../FilterRenderers/Checkbox/utils';
import useActiveQueryIndex from '../hooks/useActiveQueryIndex';
import useFilterConfig from '../hooks/useFilterConfig';
import { IQuickFiltersConfig, QuickFiltersSource, SignalType } from '../types';

interface UseActiveFilterCountsProps {
	source: QuickFiltersSource;
	signal?: SignalType;
	config: IQuickFiltersConfig[];
}

/** The quick-filter sections, and how many values each one has applied. */
function useActiveFilterCounts({
	source,
	signal,
	config,
}: UseActiveFilterCountsProps): {
	filterConfig: IQuickFiltersConfig[];
	counts: Record<string, number>;
} {
	const { filterConfig } = useFilterConfig({ signal, config });
	const compositeQuery = useGetCompositeQueryParam();
	const activeQueryIndex = useActiveQueryIndex(source);

	const counts = useMemo(() => {
		const items =
			compositeQuery?.builder.queryData?.[activeQueryIndex]?.filters?.items ?? [];
		return Object.fromEntries(
			filterConfig.map((filter) => {
				const count = items
					.filter((item) => isKeyMatch(item.key?.key, filter.attributeKey.key))
					.reduce(
						(sum, item) => sum + (Array.isArray(item.value) ? item.value.length : 1),
						0,
					);
				return [filter.attributeKey.key, count];
			}),
		);
	}, [compositeQuery, activeQueryIndex, filterConfig]);

	return { filterConfig, counts };
}

export default useActiveFilterCounts;
