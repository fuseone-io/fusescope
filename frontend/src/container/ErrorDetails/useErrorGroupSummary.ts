import { useQuery } from 'react-query';
// eslint-disable-next-line no-restricted-imports
import { useSelector } from 'react-redux';
import getAll from 'api/errors/getAll';
import { AppState } from 'store/reducers';
import { Exception } from 'types/api/errors/getAll';
import { PayloadProps as ErrorEvent } from 'types/api/errors/getByErrorTypeAndService';
import { GlobalReducer } from 'types/reducer/globalTime';

import { findGroup, groupSummaryWindow } from './utils';

const GROUP_LOOKUP_LIMIT = 100;

interface ErrorGroupSummary {
	group: Exception | undefined;
	isLoading: boolean;
}

/**
 * The event's group as the exceptions list counts it in the global time
 * range, stretched to the event: how many events, first and last seen.
 */
export function useErrorGroupSummary(event: ErrorEvent): ErrorGroupSummary {
	const { minTime, maxTime } = useSelector<AppState, GlobalReducer>(
		(state) => state.globalTime,
	);

	const [start, end] = groupSummaryWindow(minTime, maxTime, event.timestamp);

	const { data, isLoading } = useQuery(
		[
			'getErrorGroupSummary',
			event.groupID,
			event.exceptionType,
			event.serviceName,
			start,
			end,
		],
		{
			queryFn: () =>
				getAll({
					start,
					end,
					order: 'descending',
					orderParam: 'exceptionCount',
					limit: GROUP_LOOKUP_LIMIT,
					offset: 0,
					exceptionType: event.exceptionType,
					serviceName: event.serviceName,
					tags: [],
				}),
			enabled: Boolean(event.groupID),
		},
	);

	return {
		group: findGroup(data?.payload ?? undefined, event.groupID),
		isLoading,
	};
}
