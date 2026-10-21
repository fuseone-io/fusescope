import { useCallback, useEffect, useMemo, useState } from 'react';
// eslint-disable-next-line no-restricted-imports
import { useSelector } from 'react-redux'; // old code, TODO: fix this correctly
import logEvent from 'api/common/logEvent';
import { useQueryService } from 'hooks/useQueryService';
import { AppState } from 'store/reducers';
import { GlobalReducer } from 'types/reducer/globalTime';

import { TIME_PICKER_OPTIONS } from './constants';
import { homeServiceRows } from './homeServiceRows';
import ServicesWidget from './ServicesWidget';
import { useHomeServicesApm } from './useHomeServicesApm';

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

	const stats = useHomeServicesApm(
		'traces',
		timeRange.startTime,
		timeRange.endTime,
	);
	const rows = useMemo(
		() => homeServiceRows(services ?? [], stats, false),
		[services, stats],
	);
	const servicesExist = rows.length > 0;

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

	return (
		<ServicesWidget
			source="Service Traces"
			rows={rows}
			pending={isServicesLoading || isServicesFetching || isServicesError}
			selectedInterval={timeRange.selectedInterval}
			onIntervalChange={handleTimeIntervalChange}
		/>
	);
}
