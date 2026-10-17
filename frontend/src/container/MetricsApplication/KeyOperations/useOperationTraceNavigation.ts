// eslint-disable-next-line no-restricted-imports
import { useSelector } from 'react-redux';
import useResourceAttribute from 'hooks/useResourceAttribute';
import { convertRawQueriesToTraceSelectedTags } from 'hooks/useResourceAttribute/utils';
import { useSafeNavigate } from 'hooks/useSafeNavigate';
import { AppState } from 'store/reducers';
import { DataTypes } from 'types/api/queryBuilder/queryAutocompleteResponse';
import { Query, TagFilterItem } from 'types/api/queryBuilder/queryBuilderData';
import { GlobalReducer } from 'types/reducer/globalTime';
import { v4 as uuid } from 'uuid';

import { useGetAPMToTracesQueries } from '../Tabs/util';
import { navigateToTrace } from '../utils';

/** Opens one operation of the service in the traces explorer. */
export function useOperationTraceNavigation(
	servicename: string,
): (operation: string, openInNewTab: boolean) => void {
	const { safeNavigate } = useSafeNavigate();
	const { minTime, maxTime } = useSelector<AppState, GlobalReducer>(
		(state) => state.globalTime,
	);
	const { queries } = useResourceAttribute();
	const apmToTraceQuery = useGetAPMToTracesQueries({ servicename });

	return (operation, openInNewTab): void => {
		const opFilters: TagFilterItem[] = [
			{
				id: uuid().slice(0, 8),
				key: {
					key: 'name',
					dataType: DataTypes.String,
					type: 'tag',
					id: 'name--string--tag--true',
				},
				op: 'in',
				value: [operation],
			},
		];

		const preparedQuery: Query = {
			...apmToTraceQuery,
			builder: {
				...apmToTraceQuery.builder,
				queryData: apmToTraceQuery.builder.queryData?.map((item) => ({
					...item,
					filters: {
						...item.filters,
						items: [...(item.filters?.items || []), ...opFilters],
						op: item.filters?.op || 'AND',
					},
				})),
			},
		};

		navigateToTrace({
			servicename,
			operation,
			minTime,
			maxTime,
			selectedTraceTags: JSON.stringify(
				convertRawQueriesToTraceSelectedTags(queries) || [],
			),
			apmToTraceQuery: preparedQuery,
			safeNavigate,
			openInNewTab,
		});
	};
}
