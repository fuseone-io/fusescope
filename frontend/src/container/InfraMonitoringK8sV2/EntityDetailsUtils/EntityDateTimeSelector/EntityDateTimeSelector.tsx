import { useCallback } from 'react';
import TitleTooltip from 'components/PageTemplate/components/TitleTooltip';
import { Button } from 'components/ui/button';
import { Undo2 } from 'lucide-react';
import logEvent from 'api/common/logEvent';
import { InfraMonitoringEvents } from 'constants/events';
import { InfraMonitoringEntity } from 'container/InfraMonitoringK8sV2/constants';
import DateTimeSelectionV2 from 'container/TopNav/DateTimeSelectionV2';
import {
	CustomTimeType,
	Time,
} from 'container/TopNav/DateTimeSelectionV2/types';

import { useEntityDetailsTime } from './useEntityDetailsTime';

import styles from './EntityDateTimeSelector.module.scss';
import { logInfraDrawerTimeRangeCustomizedEvent } from 'container/InfraMonitoringK8sV2/EntityDetailsUtils/events';

interface EntityDateTimeSelectorProps {
	eventEntity: string;
	category: InfraMonitoringEntity;
	view: string;
}

function EntityDateTimeSelector({
	eventEntity,
	category,
	view,
}: EntityDateTimeSelectorProps): JSX.Element {
	const {
		timeRange,
		selectedInterval,
		handleTimeChange,
		handleResetToParentTime,
		hasTimeChanged,
	} = useEntityDetailsTime();

	const onTimeChange = useCallback(
		(interval: Time | CustomTimeType, dateTimeRange?: [number, number]): void => {
			void logEvent(InfraMonitoringEvents.TimeUpdated, {
				entity: eventEntity,
				page: InfraMonitoringEvents.DetailedPage,
				category,
				view,
				interval,
			});
			logInfraDrawerTimeRangeCustomizedEvent(category, interval);
			handleTimeChange(interval, dateTimeRange);
		},
		[category, view, eventEntity, handleTimeChange],
	);

	return (
		<div className={styles.container}>
			{hasTimeChanged && (
				<TitleTooltip title="Reset to list time" side="bottom">
					<Button
						variant="outline"
						size="sm"
						onClick={handleResetToParentTime}
						data-testid="reset-to-list-time-button"
						className="tw:font-sans"
					>
						<Undo2 />
						Reset
					</Button>
				</TitleTooltip>
			)}
			<DateTimeSelectionV2
				showAutoRefresh
				showRefreshText={false}
				hideShareModal
				isModalTimeSelection
				onTimeChange={onTimeChange}
				modalSelectedInterval={selectedInterval}
				modalInitialStartTime={timeRange.startTime * 1000}
				modalInitialEndTime={timeRange.endTime * 1000}
			/>
		</div>
	);
}

export default EntityDateTimeSelector;
