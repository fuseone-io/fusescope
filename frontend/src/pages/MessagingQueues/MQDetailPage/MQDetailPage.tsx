import { useEffect, useState } from 'react';
import { useHistory } from 'react-router-dom';
import logEvent from 'api/common/logEvent';
import SegmentedControl from 'components/PageTemplate/components/SegmentedControl';
import { QueryParams } from 'constants/query';
import useUrlQuery from 'hooks/useUrlQuery';

import {
	MessagingQueuesViewTypeOptions,
	ProducerLatencyOptions,
} from '../MessagingQueuesUtils';
import DropRateView from '../MQDetails/DropRateView/DropRateView';
import EvaluationTimeSelector from '../MQDetails/DropRateView/EvaluationTimeSelector';
import MessagingQueueOverview, {
	ProducerLatencyTabs,
} from '../MQDetails/MessagingQueueOverview';
import MetricPage from '../MQDetails/MetricPage/MetricPage';
import MessagingQueuesDetails from '../MQDetails/MQDetails';
import MessagingQueuesConfigOptions from '../MQGraph/MQConfigOptions';
import MessagingQueuesGraph from '../MQGraph/MQGraph';
import { KAFKA_VIEW_OPTIONS } from './constants';

function MQDetailPage(): JSX.Element {
	const history = useHistory();
	const [selectedView, setSelectedView] =
		useState<MessagingQueuesViewTypeOptions>(
			MessagingQueuesViewTypeOptions.ConsumerLag,
		);

	const [producerLatencyOption, setproducerLatencyOption] =
		useState<ProducerLatencyOptions>(ProducerLatencyOptions.Producers);

	const [dropRateInterval, setDropRateInterval] = useState<string>('');

	const mqServiceView = useUrlQuery().get(
		QueryParams.mqServiceView,
	) as MessagingQueuesViewTypeOptions;

	useEffect(() => {
		logEvent('Messaging Queues: Detail page visited', {});
	}, []);

	useEffect(() => {
		if (mqServiceView) {
			setSelectedView(mqServiceView);
		}
	}, [mqServiceView]);

	const updateUrlQuery = (query: Record<string, string | number>): void => {
		const searchParams = new URLSearchParams(history.location.search);
		Object.keys(query).forEach((key) => {
			searchParams.set(key, query[key].toString());
		});
		history.push({
			search: searchParams.toString(),
		});
	};

	const isView = (view: MessagingQueuesViewTypeOptions): boolean =>
		selectedView === view;

	return (
		<div className="tw:flex tw:flex-col tw:gap-4" data-testid="mq-detail-page">
			<div className="tw:flex tw:flex-wrap tw:items-center tw:gap-x-3 tw:gap-y-2">
				<SegmentedControl
					label="Kafka view"
					value={selectedView}
					options={KAFKA_VIEW_OPTIONS}
					onChange={(value): void => {
						setSelectedView(value);
						updateUrlQuery({ [QueryParams.mqServiceView]: value });
					}}
				/>
				<div className="tw:flex-1" />
				{isView(MessagingQueuesViewTypeOptions.ConsumerLag) && (
					<MessagingQueuesConfigOptions />
				)}
				{isView(MessagingQueuesViewTypeOptions.DropRate) && (
					<EvaluationTimeSelector setInterval={setDropRateInterval} />
				)}
				{isView(MessagingQueuesViewTypeOptions.ProducerLatency) && (
					<ProducerLatencyTabs
						option={producerLatencyOption}
						setOption={setproducerLatencyOption}
					/>
				)}
			</div>
			{isView(MessagingQueuesViewTypeOptions.ConsumerLag) && (
				<MessagingQueuesGraph />
			)}
			{isView(MessagingQueuesViewTypeOptions.DropRate) && (
				<DropRateView interval={dropRateInterval} />
			)}
			{isView(MessagingQueuesViewTypeOptions.MetricPage) && <MetricPage />}
			{(isView(MessagingQueuesViewTypeOptions.PartitionLatency) ||
				isView(MessagingQueuesViewTypeOptions.ProducerLatency)) && (
				<MessagingQueueOverview
					selectedView={selectedView}
					option={producerLatencyOption}
				/>
			)}
			<MessagingQueuesDetails
				selectedView={selectedView}
				producerLatencyOption={producerLatencyOption}
			/>
		</div>
	);
}

export default MQDetailPage;
