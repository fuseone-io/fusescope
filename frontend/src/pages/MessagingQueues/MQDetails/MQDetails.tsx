import { useEffect, useMemo, useState } from 'react';
// eslint-disable-next-line no-restricted-imports
import { useSelector } from 'react-redux';
import { useHistory, useLocation } from 'react-router-dom';
import SheetTabs from 'components/MessagingQueues/SheetTabs/SheetTabs';
import SideSheet from 'components/PageTemplate/components/SideSheet';
import { DATE_TIME_FORMATS } from 'constants/dateTimeFormats';
import { QueryParams } from 'constants/query';
import useUrlQuery from 'hooks/useUrlQuery';
import { isEmpty } from 'lodash-es';
import { useTimezone } from 'providers/Timezone';
import { AppState } from 'store/reducers';
import { GlobalReducer } from 'types/reducer/globalTime';

import {
	ConsumerLagDetailTitle,
	getMetaDataAndAPIPerView,
	MessagingQueueServiceDetailType,
	MessagingQueuesViewType,
	MessagingQueuesViewTypeOptions,
	ProducerLatencyOptions,
	SelectedTimelineQuery,
	setConfigDetail,
} from '../MessagingQueuesUtils';
import { getDetailSelection } from './detailSelection';
import MessagingQueuesTable from './MQTables/MQTables';

const MQServiceDetailTypePerView = (
	producerLatencyOption: ProducerLatencyOptions,
): Record<string, MessagingQueueServiceDetailType[]> => ({
	[MessagingQueuesViewType.consumerLag.value]: [
		MessagingQueueServiceDetailType.ProducerDetails,
		MessagingQueueServiceDetailType.ConsumerDetails,
		MessagingQueueServiceDetailType.NetworkLatency,
	],
	[MessagingQueuesViewType.partitionLatency.value]: [
		MessagingQueueServiceDetailType.ProducerDetails,
		MessagingQueueServiceDetailType.ConsumerDetails,
	],
	[MessagingQueuesViewType.producerLatency.value]: [
		producerLatencyOption === ProducerLatencyOptions.Consumers
			? MessagingQueueServiceDetailType.ConsumerDetails
			: MessagingQueueServiceDetailType.ProducerDetails,
	],
});

const checkValidityOfDetailConfigs = (
	selectedTimelineQuery: SelectedTimelineQuery,
	selectedView: MessagingQueuesViewTypeOptions,
	configDetails?: {
		[key: string]: string;
	},
): boolean => {
	if (selectedView === MessagingQueuesViewType.consumerLag.value) {
		return !(
			isEmpty(selectedTimelineQuery) ||
			(!selectedTimelineQuery?.group &&
				!selectedTimelineQuery?.topic &&
				!selectedTimelineQuery?.partition)
		);
	}

	if (selectedView === MessagingQueuesViewType.partitionLatency.value) {
		if (isEmpty(configDetails)) {
			return false;
		}

		return Boolean(configDetails?.topic && configDetails?.partition);
	}

	if (selectedView === MessagingQueuesViewType.producerLatency.value) {
		if (isEmpty(configDetails)) {
			return false;
		}

		return Boolean(configDetails?.topic && configDetails?.service_name);
	}

	return selectedView === MessagingQueuesViewType.dropRate.value;
};

/**
 * The detail of the selected chart point (consumer lag) or table row
 * (partition and producer latency), in a sheet that closes by clearing the
 * selection from the URL.
 */
function MessagingQueuesDetails({
	selectedView,
	producerLatencyOption,
}: {
	selectedView: MessagingQueuesViewTypeOptions;
	producerLatencyOption: ProducerLatencyOptions;
}): JSX.Element | null {
	const [currentTab, setCurrentTab] = useState<MessagingQueueServiceDetailType>(
		MessagingQueueServiceDetailType.ProducerDetails,
	);

	useEffect(() => {
		if (
			producerLatencyOption &&
			selectedView === MessagingQueuesViewType.producerLatency.value
		) {
			setCurrentTab(
				producerLatencyOption === ProducerLatencyOptions.Consumers
					? MessagingQueueServiceDetailType.ConsumerDetails
					: MessagingQueueServiceDetailType.ProducerDetails,
			);
		}
	}, [selectedView, producerLatencyOption]);

	const urlQuery = useUrlQuery();
	const history = useHistory();
	const location = useLocation();
	const { formatTimezoneAdjustedTimestamp } = useTimezone();

	const timelineQuery = decodeURIComponent(
		urlQuery.get(QueryParams.selectedTimelineQuery) || '',
	);

	const timelineQueryData: SelectedTimelineQuery = useMemo(
		() => (timelineQuery ? JSON.parse(timelineQuery) : {}),
		[timelineQuery],
	);

	const configDetails = decodeURIComponent(
		urlQuery.get(QueryParams.configDetail) || '',
	);

	const configDetailQueryData: {
		[key: string]: string;
	} = useMemo(
		() => (configDetails ? JSON.parse(configDetails) : {}),
		[configDetails],
	);

	const { maxTime, minTime } = useSelector<AppState, GlobalReducer>(
		(state) => state.globalTime,
	);

	const serviceConfigDetails = useMemo(
		() =>
			getMetaDataAndAPIPerView({
				detailType: currentTab,
				minTime,
				maxTime,
				selectedTimelineQuery: timelineQueryData,
				configDetails: configDetailQueryData,
			}),
		[configDetailQueryData, currentTab, maxTime, minTime, timelineQueryData],
	);

	const detailTypes =
		MQServiceDetailTypePerView(producerLatencyOption)[selectedView] || [];

	const isOpen =
		detailTypes.length > 0 &&
		checkValidityOfDetailConfigs(
			timelineQueryData,
			selectedView,
			configDetailQueryData,
		);

	if (!isOpen) {
		return null;
	}

	const isConsumerLag =
		selectedView === MessagingQueuesViewType.consumerLag.value;

	const closeDetail = (): void => {
		if (isConsumerLag) {
			urlQuery.delete(QueryParams.selectedTimelineQuery);
			history.replace(`${location.pathname}?${urlQuery.toString()}`);
		} else {
			setConfigDetail(urlQuery, location, history, {});
		}
	};

	const selection = getDetailSelection({
		isConsumerLag,
		timeline: timelineQueryData,
		config: configDetailQueryData,
		formatTime: (ms) =>
			formatTimezoneAdjustedTimestamp(ms, DATE_TIME_FORMATS.TIME),
	});

	return (
		<SideSheet
			open
			onClose={closeDetail}
			modal={false}
			width={600}
			testId="mq-detail-sheet"
			title={ConsumerLagDetailTitle[currentTab]}
			subtitle={
				selection.length > 0 && (
					<span className="tw:font-mono">{selection.join(' · ')}</span>
				)
			}
			toolbar={
				detailTypes.length > 1 ? (
					<SheetTabs
						label="Detail sections"
						tabs={detailTypes.map((detailType) => ({
							value: detailType,
							label: ConsumerLagDetailTitle[detailType],
						}))}
						value={currentTab}
						onChange={setCurrentTab}
					/>
				) : undefined
			}
			footer={
				isConsumerLag ? (
					<span className="tw:mr-auto tw:text-xs tw:text-subtle-foreground">
						Window is ±5 minutes around the selected point.
					</span>
				) : undefined
			}
		>
			<div className="tw:overflow-hidden tw:rounded-xl tw:border tw:border-border">
				<MessagingQueuesTable
					currentTab={currentTab}
					selectedView={selectedView}
					tableApi={serviceConfigDetails[selectedView]?.tableApi}
					validConfigPresent
					tableApiPayload={serviceConfigDetails[selectedView]?.tableApiPayload}
				/>
			</div>
		</SideSheet>
	);
}

export default MessagingQueuesDetails;
