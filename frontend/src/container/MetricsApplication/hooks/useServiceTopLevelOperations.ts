import { useQuery } from 'react-query';
// eslint-disable-next-line no-restricted-imports
import { useSelector } from 'react-redux';
import getTopLevelOperations, {
	ServiceDataProps,
} from 'api/metrics/getTopLevelOperations';
import { AppState } from 'store/reducers';
import { GlobalReducer } from 'types/reducer/globalTime';

interface ServiceTopLevelOperations {
	operations: string[];
	isLoading: boolean;
	isError: boolean;
	error: unknown;
}

/** The service's top-level operations, under the Overview's react-query key. */
export function useServiceTopLevelOperations(
	servicename: string,
): ServiceTopLevelOperations {
	const { maxTime, minTime } = useSelector<AppState, GlobalReducer>(
		(state) => state.globalTime,
	);
	const { data, isLoading, isError, error } = useQuery<ServiceDataProps>({
		queryKey: [servicename, minTime, maxTime],
		queryFn: (): Promise<ServiceDataProps> =>
			getTopLevelOperations({
				service: servicename || '',
				start: minTime,
				end: maxTime,
			}),
		// the time range is part of the key, so without this every window change blanks the
		// operations list and the widgets below are rebuilt with an empty `operation in []`
		keepPreviousData: true,
	});
	return {
		operations: data?.[servicename] ?? [],
		isLoading,
		isError,
		error,
	};
}
