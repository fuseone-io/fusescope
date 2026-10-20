import { useMemo } from 'react';
// eslint-disable-next-line no-restricted-imports
import { useSelector } from 'react-redux';
import { ENTITY_VERSION_V4 } from 'constants/app';
import { useGetQueriesRange } from 'hooks/queryBuilder/useGetQueriesRange';
import { useNotifications } from 'hooks/useNotifications';
import ServicesListView from 'pages/Services/components/ServicesList/ServicesList';
import { AppState } from 'store/reducers';
import { ServicesList } from 'types/api/metrics/getService';
import { GlobalReducer } from 'types/reducer/globalTime';

import { ServiceMetricsTableProps } from '../types';
import { useServicesStripInfo } from '../useServicesStripInfo';
import { getServiceListFromQuery } from '../utils';

function ServiceMetricTable({
	topLevelOperations,
	queryRangeRequestData,
}: ServiceMetricsTableProps): JSX.Element {
	const {
		minTime,
		maxTime,
		selectedTime: globalSelectedInterval,
	} = useSelector<AppState, GlobalReducer>((state) => state.globalTime);

	const { notifications } = useNotifications();

	const queries = useGetQueriesRange(queryRangeRequestData, ENTITY_VERSION_V4, {
		queryKey: [
			`GetMetricsQueryRange-${queryRangeRequestData[0].selectedTime}-${globalSelectedInterval}`,
			maxTime,
			minTime,
			globalSelectedInterval,
		],
		keepPreviousData: true,
		enabled: true,
		refetchOnMount: false,
		onError: (error) => {
			notifications.error({
				message: error.message,
			});
		},
	});

	const isLoading = queries.some((query) => query.isLoading);
	const services: ServicesList[] = useMemo(
		() =>
			getServiceListFromQuery({
				queries,
				topLevelOperations,
				isLoading,
			}),
		[isLoading, queries, topLevelOperations],
	);

	useServicesStripInfo(services.length);

	const operationsByService = useMemo(
		() =>
			topLevelOperations.map(([name, operations]): [string, string[]] => [
				String(name),
				operations,
			]),
		[topLevelOperations],
	);

	return (
		<ServicesListView
			services={services}
			loading={isLoading}
			isMetricData
			topLevelOperations={operationsByService}
		/>
	);
}

export default ServiceMetricTable;
