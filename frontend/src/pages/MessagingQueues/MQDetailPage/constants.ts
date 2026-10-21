import { SegmentedOption } from 'components/PageTemplate/components/SegmentedControl';

import { MessagingQueuesViewTypeOptions } from '../MessagingQueuesUtils';

export const KAFKA_VIEW_OPTIONS: SegmentedOption<MessagingQueuesViewTypeOptions>[] =
	[
		{ value: MessagingQueuesViewTypeOptions.ConsumerLag, label: 'Consumer lag' },
		{
			value: MessagingQueuesViewTypeOptions.PartitionLatency,
			label: 'Partition latency',
		},
		{
			value: MessagingQueuesViewTypeOptions.ProducerLatency,
			label: 'Producer latency',
		},
		{ value: MessagingQueuesViewTypeOptions.DropRate, label: 'Drop rate' },
		{ value: MessagingQueuesViewTypeOptions.MetricPage, label: 'Metrics' },
	].map((option) => ({
		...option,
		testId: `kafka-view-option-${option.value}`,
	}));
