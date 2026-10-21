import { useCallback, useMemo } from 'react';
// eslint-disable-next-line no-restricted-imports
import { useSelector } from 'react-redux';
import { useLocation } from 'react-router-dom';
import { QueryParams } from 'constants/query';
import {
	serviceExplorerPath,
	useGetAPMToTracesQueries,
} from 'container/MetricsApplication/Tabs/util';
import useResourceAttribute from 'hooks/useResourceAttribute';
import { convertRawQueriesToTraceSelectedTags } from 'hooks/useResourceAttribute/utils';
import { ExplorerViews } from 'pages/LogsExplorer/utils';
import { AppState } from 'store/reducers';
import { DataTypes } from 'types/api/queryBuilder/queryAutocompleteResponse';
import { Query, TagFilterItem } from 'types/api/queryBuilder/queryBuilderData';
import { GlobalReducer } from 'types/reducer/globalTime';
import { setListOrderBy } from 'utils/explorerUtils';

/** A traces explorer filter on one span field. */
export function traceFilter(
	key: string,
	value: string | string[],
	dataType: DataTypes = DataTypes.String,
	type = 'tag',
): TagFilterItem {
	return {
		id: `${key}-${String(value)}`.slice(0, 32),
		key: { key, dataType, type, id: `${key}--${dataType}--${type}--true` },
		op: Array.isArray(value) ? 'in' : '=',
		value,
	};
}

export const ERROR_SPANS_FILTER = traceFilter(
	'hasError',
	['true'],
	DataTypes.bool,
);

/** The explorer list's order by, slowest spans first. */
export const SLOWEST_FIRST = 'duration_nano:desc';

function withFilters(query: Query, filters: TagFilterItem[]): Query {
	return {
		...query,
		builder: {
			...query.builder,
			queryData: query.builder.queryData.map((item) => ({
				...item,
				filters: {
					...item.filters,
					items: [...(item.filters?.items ?? []), ...filters],
					op: item.filters?.op || 'AND',
				},
			})),
		},
	};
}

function listViewSearch(search: string): string {
	const params = new URLSearchParams(search);
	params.set(QueryParams.selectedExplorerView, ExplorerViews.LIST);
	return params.toString();
}

/**
 * The service's traces over the selected range, narrowed by extra filters;
 * with `orderBy`, the explorer's list sorted that way.
 */
export function useTracesLink(
	servicename: string,
): (filters?: TagFilterItem[], orderBy?: string) => string {
	const { search } = useLocation();
	const { minTime, maxTime } = useSelector<AppState, GlobalReducer>(
		(state) => state.globalTime,
	);
	const { queries } = useResourceAttribute();
	const tracesQuery = useGetAPMToTracesQueries({ servicename });
	const selectedTraceTags = useMemo(
		() => JSON.stringify(convertRawQueriesToTraceSelectedTags(queries) || []),
		[queries],
	);

	return useCallback(
		(filters: TagFilterItem[] = [], orderBy?: string): string => {
			const query = withFilters(tracesQuery, filters);
			return serviceExplorerPath({
				isLogs: false,
				search: orderBy ? listViewSearch(search) : search,
				servicename,
				selectedTraceTags,
				query: orderBy ? setListOrderBy(query, orderBy) : query,
				startTimeMs: Math.floor(minTime / 1e6),
				endTimeMs: Math.floor(maxTime / 1e6),
			});
		},
		[search, servicename, selectedTraceTags, tracesQuery, minTime, maxTime],
	);
}
