import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { QueryKey } from 'react-query';
// eslint-disable-next-line no-restricted-imports
import { useSelector } from 'react-redux';
import logEvent from 'api/common/logEvent';
import { ENTITY_VERSION_V4 } from 'constants/app';
import {
	getQueryRangeRequestData,
	getServiceListFromQuery,
} from 'container/ServiceApplication/utils';
import { useGetQueriesRange } from 'hooks/queryBuilder/useGetQueriesRange';
import useGetTopLevelOperations from 'hooks/useGetTopLevelOperations';
import useResourceAttribute from 'hooks/useResourceAttribute';
import { convertRawQueriesToTraceSelectedTags } from 'hooks/useResourceAttribute/utils';
import { AppState } from 'store/reducers';
import { ServicesList } from 'types/api/metrics/getService';
import { GlobalReducer } from 'types/reducer/globalTime';
import { Tags } from 'hooks/useResourceAttribute/types';

import { TIME_PICKER_OPTIONS } from './constants';
import { homeServiceRows } from './homeServiceRows';
import ServicesWidget from './ServicesWidget';
import { useHomeServicesApm } from './useHomeServicesApm';

const homeInterval = 30 * 60 * 1000;

function ServiceMetrics({
	onUpdateChecklistDoneItem,
	loadingUserPreferences,
}: {
	onUpdateChecklistDoneItem: (itemKey: string) => void;
	loadingUserPreferences: boolean;
}): JSX.Element {
	const { selectedTime: globalSelectedInterval } = useSelector<
		AppState,
		GlobalReducer
	>((state) => state.globalTime);

	const [timeRange, setTimeRange] = useState(() => {
		const now = new Date().getTime();
		return {
			startTime: now - homeInterval,
			endTime: now,
			selectedInterval: homeInterval,
		};
	});

	const { queries } = useResourceAttribute();

	const selectedTags = useMemo(
		() => (convertRawQueriesToTraceSelectedTags(queries) as Tags[]) || [],
		[queries],
	);

	const [isError, setIsError] = useState(false);

	const queryKey: QueryKey = useMemo(
		() => [
			timeRange.startTime,
			timeRange.endTime,
			selectedTags,
			globalSelectedInterval,
		],
		[
			timeRange.startTime,
			timeRange.endTime,
			selectedTags,
			globalSelectedInterval,
		],
	);

	const {
		data,
		isLoading: isLoadingTopLevelOperations,
		isError: isErrorTopLevelOperations,
	} = useGetTopLevelOperations(queryKey, {
		start: timeRange.startTime * 1e6,
		end: timeRange.endTime * 1e6,
	});

	const handleTimeIntervalChange = useCallback((value: number): void => {
		const timeInterval = TIME_PICKER_OPTIONS.find(
			(option) => option.value === value,
		);

		void logEvent('Homepage: Services time interval updated', {
			updatedTimeInterval: timeInterval?.label,
		});

		const now = new Date();
		setTimeRange({
			startTime: now.getTime() - value,
			endTime: now.getTime(),
			selectedInterval: value,
		});
	}, []);

	const topLevelOperations = useMemo(() => Object.entries(data || {}), [data]);

	const queryRangeRequestData = useMemo(
		() =>
			getQueryRangeRequestData({
				topLevelOperations,
				globalSelectedInterval,
			}),
		[globalSelectedInterval, topLevelOperations],
	);

	const dataQueries = useGetQueriesRange(
		queryRangeRequestData,
		ENTITY_VERSION_V4,
		{
			queryKey: useMemo(
				() => [
					`GetMetricsQueryRange-home-${globalSelectedInterval}`,
					timeRange.endTime,
					timeRange.startTime,
					globalSelectedInterval,
				],
				[globalSelectedInterval, timeRange.endTime, timeRange.startTime],
			),
			keepPreviousData: true,
			enabled: true,
			refetchOnMount: false,
			onError: () => {
				setIsError(true);
			},
		},
	);

	const isLoading = useMemo(
		() => dataQueries.some((query) => query.isLoading),
		[dataQueries],
	);

	const services: ServicesList[] = useMemo(
		() =>
			getServiceListFromQuery({
				queries: dataQueries,
				topLevelOperations,
				isLoading,
			}),
		[dataQueries, topLevelOperations, isLoading],
	);

	const stats = useHomeServicesApm(
		'span-metrics',
		timeRange.startTime,
		timeRange.endTime,
		topLevelOperations,
	);
	const rows = useMemo(
		() => homeServiceRows(services, stats, true),
		[services, stats],
	);
	const servicesExist = rows.length > 0;

	useEffect(() => {
		if (!loadingUserPreferences && servicesExist) {
			onUpdateChecklistDoneItem('SETUP_SERVICES');
		}
	}, [onUpdateChecklistDoneItem, loadingUserPreferences, servicesExist]);

	return (
		<ServicesWidget
			source="Service Metrics"
			rows={rows}
			pending={
				isLoadingTopLevelOperations ||
				isLoading ||
				isErrorTopLevelOperations ||
				isError
			}
			selectedInterval={timeRange.selectedInterval}
			onIntervalChange={handleTimeIntervalChange}
		/>
	);
}

export default memo(ServiceMetrics);
