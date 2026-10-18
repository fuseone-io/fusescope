import { useCallback, useEffect, useState } from 'react';
import { useMutation, useQuery } from 'react-query';
import logEvent from 'api/common/logEvent';
import { useGetMetricsOnboardingStatus } from 'api/generated/services/metrics';
import listUserPreferences from 'api/v1/user/preferences/list';
import updateUserPreferenceAPI from 'api/v1/user/preferences/name/update';
import PageTemplate from 'components/PageTemplate/PageTemplate';
import HeaderRightSection from 'components/HeaderRightSection/HeaderRightSection';
import NoAuthBanner from 'components/NoAuthBanner/NoAuthBanner';
import { getIsNoAuthMode } from 'utils/noAuthMode';
import { ENTITY_VERSION_V5 } from 'constants/app';
import { ORG_PREFERENCES } from 'constants/orgPreferences';
import { initialQueriesMap, PANEL_TYPES } from 'constants/queryBuilder';
import { REACT_QUERY_KEY } from 'constants/reactQueryKeys';
import { DEFAULT_TIME_RANGE } from 'container/TopNav/DateTimeSelectionV2/constants';
import { useHomeStripInfo } from 'container/Home/useHomeStripInfo';
import { useGetQueryRange } from 'hooks/queryBuilder/useGetQueryRange';
import cloneDeep from 'lodash-es/cloneDeep';
import { useAppContext } from 'providers/App/App';
import { UserPreference } from 'types/api/preferences/preference';
import { DataSource } from 'types/common/queryBuilder';
import { USER_ROLES } from 'types/roles';
import { isIngestionActive } from 'utils/app';

import AlertRules from './AlertRules/AlertRules';
import ExplorerCards from './components/ExplorerCards';
import IngestionPanel from './components/IngestionPanel';
import WelcomeChecklistPanel from './components/WelcomeChecklistPanel';
import WelcomeChecklistPopover from './components/WelcomeChecklistPopover';
import { defaultChecklistItemsState } from './constants';
import Dashboards from './Dashboards/Dashboards';
import DataSourceInfo from './DataSourceInfo/DataSourceInfo';
import { ChecklistItem } from './HomeChecklist/HomeChecklist';
import SavedViews from './SavedViews/SavedViews';
import Services from './Services/Services';

const homeInterval = 30 * 60 * 1000;

export default function Home(): JSX.Element {
	useHomeStripInfo();

	const { user } = useAppContext();

	const [startTime, setStartTime] = useState<number | null>(null);
	const [endTime, setEndTime] = useState<number | null>(null);
	const [updatingUserPreferences, setUpdatingUserPreferences] = useState(false);
	const [loadingUserPreferences, setLoadingUserPreferences] = useState(true);

	const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>(
		defaultChecklistItemsState,
	);

	const [isWelcomeChecklistSkipped, setIsWelcomeChecklistSkipped] =
		useState(false);

	useEffect(() => {
		const now = new Date();
		const startTime = new Date(now.getTime() - homeInterval);
		const endTime = now;

		setStartTime(startTime.getTime());
		setEndTime(endTime.getTime());
	}, []);

	// Detect Logs
	const { data: logsData, isLoading: isLogsLoading } = useGetQueryRange(
		{
			query: initialQueriesMap[DataSource.LOGS],
			graphType: PANEL_TYPES.VALUE,
			selectedTime: 'GLOBAL_TIME',
			globalSelectedInterval: DEFAULT_TIME_RANGE,
			params: {
				dataSource: DataSource.LOGS,
			},
			formatForWeb: false,
		},
		ENTITY_VERSION_V5,
		{
			queryKey: [
				REACT_QUERY_KEY.GET_QUERY_RANGE,
				DEFAULT_TIME_RANGE,
				endTime || Date.now(),
				startTime || Date.now(),
				initialQueriesMap[DataSource.LOGS],
			],
			enabled: !!startTime && !!endTime,
		},
	);

	// Detect Traces
	const { data: tracesData, isLoading: isTracesLoading } = useGetQueryRange(
		{
			query: initialQueriesMap[DataSource.TRACES],
			graphType: PANEL_TYPES.VALUE,
			selectedTime: 'GLOBAL_TIME',
			globalSelectedInterval: DEFAULT_TIME_RANGE,
			params: {
				dataSource: DataSource.TRACES,
			},
			formatForWeb: false,
		},
		ENTITY_VERSION_V5,
		{
			queryKey: [
				REACT_QUERY_KEY.GET_QUERY_RANGE,
				DEFAULT_TIME_RANGE,
				endTime || Date.now(),
				startTime || Date.now(),
				initialQueriesMap[DataSource.TRACES],
			],
			enabled: !!startTime && !!endTime,
		},
	);

	// Detect Metrics
	const { data: metricsOnboardingData } = useGetMetricsOnboardingStatus();

	const [isLogsIngestionActive, setIsLogsIngestionActive] = useState(false);
	const [isTracesIngestionActive, setIsTracesIngestionActive] = useState(false);
	const [isMetricsIngestionActive, setIsMetricsIngestionActive] =
		useState(false);

	const processUserPreferences = (userPreferences: UserPreference[]): void => {
		const checklistSkipped = Boolean(
			userPreferences?.find(
				(preference) =>
					preference.name === ORG_PREFERENCES.WELCOME_CHECKLIST_DO_LATER,
			)?.value,
		);

		const updatedChecklistItems = cloneDeep(checklistItems);

		const newChecklistItems = updatedChecklistItems.map((item) => {
			const newItem = { ...item };

			const isSkipped = Boolean(
				userPreferences?.find(
					(preference) => preference.name === item.skippedPreferenceKey,
				)?.value,
			);

			newItem.isSkipped = isSkipped || false;
			return newItem;
		});

		setChecklistItems(newChecklistItems);

		setIsWelcomeChecklistSkipped(checklistSkipped || false);
	};

	// Fetch User Preferences
	const { refetch: refetchUserPreferences } = useQuery({
		queryFn: () => listUserPreferences(),
		queryKey: ['getUserPreferences'],
		enabled: true,
		refetchOnWindowFocus: false,
		onSuccess: (response) => {
			if (response.data) {
				processUserPreferences(response.data);
			}

			setLoadingUserPreferences(false);
			setUpdatingUserPreferences(false);
		},
		onError: () => {
			setUpdatingUserPreferences(false);
			setLoadingUserPreferences(false);
		},
	});

	const { mutate: updateUserPreference } = useMutation(updateUserPreferenceAPI, {
		onSuccess: () => {
			setUpdatingUserPreferences(false);
			void refetchUserPreferences();
		},
		onError: () => {
			setUpdatingUserPreferences(false);
		},
	});

	const handleWillDoThisLater = (): void => {
		void logEvent('Welcome Checklist: Will do this later clicked', {});
		setUpdatingUserPreferences(true);

		updateUserPreference({
			name: ORG_PREFERENCES.WELCOME_CHECKLIST_DO_LATER,
			value: true,
		});
	};

	const handleSkipChecklistItem = (item: ChecklistItem): void => {
		if (item.skippedPreferenceKey) {
			setUpdatingUserPreferences(true);

			updateUserPreference({
				name: item.skippedPreferenceKey,
				value: true,
			});
		}
	};

	const handleUpdateChecklistDoneItem = useCallback((itemKey: string): void => {
		setChecklistItems((prevItems) =>
			prevItems.map((item) =>
				item.id === itemKey ? { ...item, completed: true } : item,
			),
		);
	}, []);

	useEffect(() => {
		const isLogsIngestionActive = isIngestionActive(logsData?.payload);

		if (isLogsIngestionActive) {
			setIsLogsIngestionActive(true);
			handleUpdateChecklistDoneItem('SEND_LOGS');
			handleUpdateChecklistDoneItem('ADD_DATA_SOURCE');
		}
	}, [logsData, handleUpdateChecklistDoneItem]);

	useEffect(() => {
		const isTracesIngestionActive = isIngestionActive(tracesData?.payload);

		if (isTracesIngestionActive) {
			setIsTracesIngestionActive(true);
			handleUpdateChecklistDoneItem('SEND_TRACES');
			handleUpdateChecklistDoneItem('ADD_DATA_SOURCE');
		}
	}, [tracesData, handleUpdateChecklistDoneItem]);

	useEffect(() => {
		if (metricsOnboardingData?.data?.hasMetrics) {
			setIsMetricsIngestionActive(true);
			handleUpdateChecklistDoneItem('ADD_DATA_SOURCE');
			handleUpdateChecklistDoneItem('SEND_METRICS');
		}
	}, [metricsOnboardingData, handleUpdateChecklistDoneItem]);

	useEffect(() => {
		void logEvent('Homepage: Visited', {});
	}, []);

	const isIngestionActiveForAny =
		isLogsIngestionActive || isTracesIngestionActive || isMetricsIngestionActive;
	const showChecklist = !isWelcomeChecklistSkipped && !loadingUserPreferences;
	const checklistBusy = updatingUserPreferences || loadingUserPreferences;

	return (
		<PageTemplate testId="home-page">
			{getIsNoAuthMode() && <NoAuthBanner />}
			<DataSourceInfo
				dataSentToSigNoz={isIngestionActiveForAny}
				isLoading={isLogsLoading || isTracesLoading}
				actions={
					<>
						<HeaderRightSection
							enableAnnouncements={false}
							enableFeedback={false}
							enableShare={false}
						/>
						{isWelcomeChecklistSkipped && (
							<WelcomeChecklistPopover
								checklistItems={checklistItems}
								onSkip={handleSkipChecklistItem}
								isLoading={checklistBusy}
							/>
						)}
					</>
				}
			/>

			{(isIngestionActiveForAny || showChecklist) && (
				<div className="tw:flex tw:flex-wrap tw:items-start tw:gap-4">
					{isIngestionActiveForAny && (
						<IngestionPanel
							logs={isLogsIngestionActive}
							traces={isTracesIngestionActive}
							metrics={isMetricsIngestionActive}
							className="tw:flex-[2_1_520px]"
						/>
					)}
					{showChecklist && (
						<WelcomeChecklistPanel
							checklistItems={checklistItems}
							onSkip={handleSkipChecklistItem}
							onDoLater={handleWillDoThisLater}
							isLoading={checklistBusy}
						/>
					)}
				</div>
			)}

			{user?.role !== USER_ROLES.VIEWER && <ExplorerCards />}

			{isIngestionActiveForAny && (
				<div className="tw:grid tw:items-start tw:gap-4 tw:xl:grid-cols-2">
					<AlertRules
						onUpdateChecklistDoneItem={handleUpdateChecklistDoneItem}
						loadingUserPreferences={loadingUserPreferences}
					/>
					<Services
						onUpdateChecklistDoneItem={handleUpdateChecklistDoneItem}
						loadingUserPreferences={loadingUserPreferences}
					/>
					<Dashboards
						onUpdateChecklistDoneItem={handleUpdateChecklistDoneItem}
						loadingUserPreferences={loadingUserPreferences}
					/>
					<SavedViews
						onUpdateChecklistDoneItem={handleUpdateChecklistDoneItem}
						loadingUserPreferences={loadingUserPreferences}
					/>
				</div>
			)}
		</PageTemplate>
	);
}
