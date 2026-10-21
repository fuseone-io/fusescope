import TitleTooltip from 'components/PageTemplate/components/TitleTooltip';
import { ConditionalAlertPopover } from 'container/AlertHistory/AlertPopover/AlertPopover';
import { AlertRuleTimelineTableResponse } from 'types/api/alerts/def';

import TimelineActionsButton from './TimelineActionsButton';

function TimelineRowActions({
	record,
}: {
	record: AlertRuleTimelineTableResponse;
}): JSX.Element {
	if (!record.relatedTracesLink && !record.relatedLogsLink) {
		return (
			<TitleTooltip title="No links available for this item">
				<span className="tw:inline-flex">
					<TimelineActionsButton disabled />
				</span>
			</TitleTooltip>
		);
	}

	return (
		<ConditionalAlertPopover
			relatedTracesLink={record.relatedTracesLink ?? ''}
			relatedLogsLink={record.relatedLogsLink ?? ''}
		>
			<TimelineActionsButton />
		</ConditionalAlertPopover>
	);
}

export default TimelineRowActions;
