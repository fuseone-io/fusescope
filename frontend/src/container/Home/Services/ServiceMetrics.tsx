import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { QueryKey } from 'react-query';
// eslint-disable-next-line no-restricted-imports
import { useSelector } from 'react-redux';
import logEvent from 'api/common/logEvent';
import { ENTITY_VERSION_V4 } from 'constants/app';
import ROUTES from 'constants/routes';
import {
	getQueryRangeRequestData,
	getServiceListFromQuery,
} from 'container/ServiceApplication/utils';
import { useGetQueriesRange } from 'hooks/queryBuilder/useGetQueriesRange';
import useGetTopLevelOperations from 'hooks/useGetTopLevelOperations';
import useResourceAttribute from 'hooks/useResourceAttribute';
import { convertRawQueriesToTraceSelectedTags } from 'hooks/useResourceAttribute/utils';
import { useSafeNavigate } from 'hooks/useSafeNavigate';
import { AppState } from 'store/reducers';
import { ServicesList } from 'types/api/metrics/getService';
import { GlobalReducer } from 'types/reducer/globalTime';
import { Tags } from 'hooks/useResourceAttribute/types';
import { isModifierKeyPressed } from 'utils/app';

import { TIME_PICKER_OPTIONS } from './constants';
import ServicesWidget from './ServicesWidget';

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
	const { safeNavigate } = useSafeNavigate();

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

	const sortedServices = useMemo(
		() =>
			services?.sort((a, b) => {
				const aUpdateAt = new Date(a.p99).getTime();
				const bUpdateAt = new Date(b.p99).getTime();
				return bUpdateAt - aUpdateAt;
			}) || [],
		[services],
	);

	const servicesExist = sortedServices.length > 0;
	const top5Services = useMemo(
		() => sortedServices.slice(0, 5),
		[sortedServices],
	);

	useEffect(() => {
		if (!loadingUserPreferences && servicesExist) {
			onUpdateChecklistDoneItem('SETUP_SERVICES');
		}
	}, [onUpdateChecklistDoneItem, loadingUserPreferences, servicesExist]);

	const handleRowClick = useCallback(
		(record: ServicesList, event: React.MouseEvent) => {
			void logEvent('Homepage: Service clicked', {
				serviceName: record.serviceName,
			});
			safeNavigate(`${ROUTES.APPLICATION}/${record.serviceName}`, {
				newTab: isModifierKeyPressed(event),
			});
		},
		[safeNavigate],
	);

	return (
		<ServicesWidget
			source="Service Metrics"
			services={top5Services}
			pending={
				isLoadingTopLevelOperations ||
				isLoading ||
				isErrorTopLevelOperations ||
				isError
			}
			selectedInterval={timeRange.selectedInterval}
			onIntervalChange={handleTimeIntervalChange}
			onRowClick={handleRowClick}
		/>
	);
}

export default memo(ServiceMetrics);
