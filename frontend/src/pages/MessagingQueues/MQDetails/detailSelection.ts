import { SelectedTimelineQuery } from '../MessagingQueuesUtils';

/** What the detail sheet is about: the clicked series and window, or the selected row. */
export function getDetailSelection({
	isConsumerLag,
	timeline,
	config,
	formatTime,
}: {
	isConsumerLag: boolean;
	timeline: SelectedTimelineQuery;
	config: Record<string, string>;
	formatTime: (ms: number) => string;
}): string[] {
	const source = isConsumerLag
		? {
				group: timeline.group,
				topic: timeline.topic,
				partition: timeline.partition,
			}
		: {
				service: config.service_name,
				topic: config.topic,
				partition: config.partition,
			};

	const parts = [
		'group' in source ? source.group : source.service,
		source.topic,
		source.partition ? `partition ${source.partition}` : undefined,
	];
	if (isConsumerLag && timeline.start && timeline.end) {
		parts.push(`${formatTime(timeline.start)}–${formatTime(timeline.end)}`);
	}
	return parts.filter((part): part is string => !!part);
}
