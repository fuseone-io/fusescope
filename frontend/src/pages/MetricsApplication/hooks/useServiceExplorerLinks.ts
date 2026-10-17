import { useMemo } from 'react';
// eslint-disable-next-line no-restricted-imports
import { useSelector } from 'react-redux';
import { useLocation } from 'react-router-dom';
import { QueryParams } from 'constants/query';
import ROUTES from 'constants/routes';
import {
	generateExplorerPath,
	useGetAPMToLogsQueries,
	useGetAPMToTracesQueries,
} from 'container/MetricsApplication/Tabs/util';
import { routeConfig } from 'container/SideNav/config';
import { getQueryString } from 'container/SideNav/helper';
import useResourceAttribute from 'hooks/useResourceAttribute';
import { convertRawQueriesToTraceSelectedTags } from 'hooks/useResourceAttribute/utils';
import { AppState } from 'store/reducers';
import { Query } from 'types/api/queryBuilder/queryBuilderData';
import { GlobalReducer } from 'types/reducer/globalTime';

interface ServiceExplorerLinks {
	tracesUrl: string;
	logsUrl: string;
}

/**
 * The traces and logs explorers for this service over the whole selected
 * range, built like the charts' "View traces"/"View logs" popups.
 */
export function useServiceExplorerLinks(
	servicename: string,
): ServiceExplorerLinks {
	const { search } = useLocation();
	const { minTime, maxTime } = useSelector<AppState, GlobalReducer>(
		(state) => state.globalTime,
	);
	const { queries } = useResourceAttribute();
	const tracesQuery = useGetAPMToTracesQueries({ servicename });
	const logsQuery = useGetAPMToLogsQueries({ servicename });

	return useMemo(() => {
		const urlParams = new URLSearchParams(search);
		urlParams.set(QueryParams.startTime, Math.floor(minTime / 1e6).toString());
		urlParams.set(QueryParams.endTime, Math.floor(maxTime / 1e6).toString());
		urlParams.delete(QueryParams.relativeTime);
		const queryString = getQueryString(
			routeConfig[ROUTES.TRACES_EXPLORER],
			urlParams,
		);
		const selectedTraceTags = JSON.stringify(
			convertRawQueriesToTraceSelectedTags(queries) || [],
		);

		const pathFor = (query: Query, isLogs: boolean): string =>
			generateExplorerPath(
				isLogs,
				urlParams,
				servicename,
				selectedTraceTags,
				encodeURIComponent(JSON.stringify(query)),
				queryString,
			);

		return {
			tracesUrl: pathFor(tracesQuery, false),
			logsUrl: pathFor(logsQuery, true),
		};
		// The logs query gets fresh filter ids every render; its content follows servicename.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [maxTime, minTime, queries, search, servicename, tracesQuery]);
}
