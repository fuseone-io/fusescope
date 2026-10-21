import { useMemo } from 'react';
// eslint-disable-next-line no-restricted-imports
import { useSelector } from 'react-redux';
import { useGetCompositeQueryParam } from 'hooks/queryBuilder/useGetCompositeQueryParam';
import { useListOverview } from 'hooks/thirdPartyApis/useListOverview';
import { get } from 'lodash-es';
import { AppState } from 'store/reducers';
import { GlobalReducer } from 'types/reducer/globalTime';

import { DomainRow, toDomainRow } from '../../../domainList';
import { useApiMonitoringParams } from '../../../queryParams';
import { APIDomainsRowData } from '../../../types';
import { formatDataForTable } from '../../../utils';

export interface DomainListState {
	rows: DomainRow[];
	/** The rows as the domain drawer used to receive them. */
	tableRows: APIDomainsRowData[];
	/** The user's filter expression, without the client-span clause. */
	filterExpression: string;
	isLoading: boolean;
	isFetching: boolean;
	isError: boolean;
}

/** The domains of the list page, for every view that reads them from the URL. */
export function useDomainList(): DomainListState {
	const [{ showIP }] = useApiMonitoringParams();
	const { maxTime, minTime } = useSelector<AppState, GlobalReducer>(
		(state) => state.globalTime,
	);
	const compositeData = useGetCompositeQueryParam();
	const filterExpression: string = get(
		compositeData,
		'builder.queryData[0].filter.expression',
		'',
	);

	const { data, isLoading, isFetching, isError } = useListOverview({
		start: minTime,
		end: maxTime,
		show_ip: Boolean(showIP ?? true),
		filter: { expression: `kind_string = 'Client' ${filterExpression}` },
	});

	const tableRows = useMemo(
		() =>
			formatDataForTable(
				data?.data?.data?.data.results[0]?.data || [],
				data?.data?.data?.data.results[0]?.columns || [],
			),
		[data],
	);
	const rows = useMemo(() => tableRows.map(toDomainRow), [tableRows]);

	return { rows, tableRows, filterExpression, isLoading, isFetching, isError };
}
