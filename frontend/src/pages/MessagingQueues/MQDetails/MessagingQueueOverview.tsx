import { Dispatch, SetStateAction, useMemo } from 'react';
// eslint-disable-next-line no-restricted-imports
import { useSelector } from 'react-redux';
import { useHistory, useLocation } from 'react-router-dom';
import { MessagingQueueServicePayload } from 'api/messagingQueues/getConsumerLagDetails';
import { getKafkaSpanEval } from 'api/messagingQueues/getKafkaSpanEval';
import { getPartitionLatencyOverview } from 'api/messagingQueues/getPartitionLatencyOverview';
import { getTopicThroughputOverview } from 'api/messagingQueues/getTopicThroughputOverview';
import ContentPanel from 'components/PageTemplate/components/ContentPanel';
import SegmentedControl from 'components/PageTemplate/components/SegmentedControl';
import useUrlQuery from 'hooks/useUrlQuery';
import { AppState } from 'store/reducers';
import { GlobalReducer } from 'types/reducer/globalTime';

import {
	MessagingQueuesViewType,
	MessagingQueuesViewTypeOptions,
	ProducerLatencyOptions,
	setConfigDetail,
} from '../MessagingQueuesUtils';
import MessagingQueuesTable from './MQTables/MQTables';

export function ProducerLatencyTabs({
	option,
	setOption,
}: {
	option: ProducerLatencyOptions;
	setOption: Dispatch<SetStateAction<ProducerLatencyOptions>>;
}): JSX.Element {
	const urlQuery = useUrlQuery();
	const location = useLocation();
	const history = useHistory();

	return (
		<SegmentedControl
			label="Producers or consumers"
			value={option}
			onChange={(value): void => {
				setConfigDetail(urlQuery, location, history, {});
				setOption(value);
			}}
			options={[
				{
					value: ProducerLatencyOptions.Producers,
					label: ProducerLatencyOptions.Producers,
				},
				{
					value: ProducerLatencyOptions.Consumers,
					label: ProducerLatencyOptions.Consumers,
				},
			]}
		/>
	);
}

const getTableApi = (selectedView: MessagingQueuesViewTypeOptions): any => {
	if (selectedView === MessagingQueuesViewType.producerLatency.value) {
		return getTopicThroughputOverview;
	}
	if (selectedView === MessagingQueuesViewType.dropRate.value) {
		return getKafkaSpanEval;
	}
	return getPartitionLatencyOverview;
};

function panelCopy(
	selectedView: MessagingQueuesViewTypeOptions,
	option: ProducerLatencyOptions,
): { title: string; subtitle: string } {
	if (selectedView === MessagingQueuesViewType.producerLatency.value) {
		return option === ProducerLatencyOptions.Producers
			? {
					title: 'Producers',
					subtitle: 'Select a row for its producer details.',
				}
			: {
					title: 'Consumers',
					subtitle: 'Select a row for its consumer group details.',
				};
	}
	return {
		title: 'Partitions',
		subtitle: 'Select a partition for its producers and consumer groups.',
	};
}

function MessagingQueueOverview({
	selectedView,
	option,
}: {
	selectedView: MessagingQueuesViewTypeOptions;
	option: ProducerLatencyOptions;
}): JSX.Element {
	const { maxTime, minTime } = useSelector<AppState, GlobalReducer>(
		(state) => state.globalTime,
	);

	const tableApiPayload: MessagingQueueServicePayload = useMemo(
		() => ({
			variables: {},
			start: minTime,
			end: maxTime,
			detailType:
				selectedView === MessagingQueuesViewType.producerLatency.value
					? option === ProducerLatencyOptions.Producers
						? 'producer'
						: 'consumer'
					: undefined,
		}),
		[minTime, maxTime, selectedView, option],
	);

	const { title, subtitle } = panelCopy(selectedView, option);

	return (
		<ContentPanel
			testId="mq-overview-panel"
			divided
			title={title}
			subtitle={subtitle}
		>
			<MessagingQueuesTable
				selectedView={selectedView}
				tableApiPayload={tableApiPayload}
				tableApi={getTableApi(selectedView)}
				validConfigPresent
				type="Overview"
				option={option}
			/>
		</ContentPanel>
	);
}
export default MessagingQueueOverview;
