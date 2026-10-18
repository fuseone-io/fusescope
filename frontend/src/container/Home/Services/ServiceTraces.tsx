import React, { useCallback, useEffect, useMemo, useState } from 'react';
// eslint-disable-next-line no-restricted-imports
import { useSelector } from 'react-redux'; // old code, TODO: fix this correctly
import logEvent from 'api/common/logEvent';
import ROUTES from 'constants/routes';
import { useQueryService } from 'hooks/useQueryService';
import { useSafeNavigate } from 'hooks/useSafeNavigate';
import { AppState } from 'store/reducers';
import { ServicesList } from 'types/api/metrics/getService';
import { GlobalReducer } from 'types/reducer/globalTime';
import { isModifierKeyPressed } from 'utils/app';

import { TIME_PICKER_OPTIONS } from './constants';
import ServicesWidget from './ServicesWidget';

const homeInterval = 30 * 60 * 1000;

export default function ServiceTraces({
	onUpdateChecklistDoneItem,
	loadingUserPreferences,
}: {
	onUpdateChecklistDoneItem: (itemKey: string) => void;
	loadingUserPreferences: boolean;
}): JSX.Element {
	const { selectedTime } = useSelector<AppState, GlobalReducer>(
		(state) => state.globalTime,
	);

	const now = new Date().getTime();
	const [timeRange, setTimeRange] = useState({
		startTime: now - homeInterval,
		endTime: now,
		selectedInterval: homeInterval,
	});

	const { safeNavigate } = useSafeNavigate();

	// Fetch Services
	const {
		data: services,
		isLoading: isServicesLoading,
		isFetching: isServicesFetching,
		isError: isServicesError,
	} = useQueryService({
		minTime: timeRange.startTime * 1e6,
		maxTime: timeRange.endTime * 1e6,
		selectedTime,
		selectedTags: [],
		options: {
			enabled: true,
		},
	});

	const sortedServices = useMemo(
		() => services?.sort((a, b) => b.p99 - a.p99) || [],
		[services],
	);

	const servicesExist = useMemo(
		() => sortedServices.length > 0,
		[sortedServices],
	);
	const top5Services = useMemo(
		() => sortedServices.slice(0, 5),
		[sortedServices],
	);

	useEffect(() => {
		if (servicesExist && !loadingUserPreferences) {
			onUpdateChecklistDoneItem('SETUP_SERVICES');
		}
	}, [servicesExist, onUpdateChecklistDoneItem, loadingUserPreferences]);

	const handleTimeIntervalChange = useCallback((value: number): void => {
		const now = new Date();

		const timeInterval = TIME_PICKER_OPTIONS.find(
			(option) => option.value === value,
		);

		void logEvent('Homepage: Services time interval updated', {
			updatedTimeInterval: timeInterval?.label,
		});

		setTimeRange({
			startTime: now.getTime() - value,
			endTime: now.getTime(),
			selectedInterval: value,
		});
	}, []);

	const handleRowClick = useCallback(
		(record: ServicesList, event: React.MouseEvent): void => {
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
			source="Service Traces"
			services={top5Services}
			pending={isServicesLoading || isServicesFetching || isServicesError}
			selectedInterval={timeRange.selectedInterval}
			onIntervalChange={handleTimeIntervalChange}
			onRowClick={handleRowClick}
		/>
	);
}
