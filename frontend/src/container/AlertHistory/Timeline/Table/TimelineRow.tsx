import StatusBadge from 'components/PageTemplate/components/StatusBadge';
import { TableCell, TableRow } from 'components/ui/table';
import logEvent from 'api/common/logEvent';
import { DATE_TIME_FORMATS } from 'constants/dateTimeFormats';
import LabelChips from 'container/AlertHistory/LabelChips/LabelChips';
import { alertStateBadge } from 'container/AlertHistory/utils/display';
import { TimestampInput } from 'hooks/useTimezoneFormatter/useTimezoneFormatter';
import { AlertRuleTimelineTableResponse } from 'types/api/alerts/def';

import TimelineRowActions from './TimelineRowActions';

interface TimelineRowProps {
	record: AlertRuleTimelineTableResponse;
	formatTimezoneAdjustedTimestamp: (
		input: TimestampInput,
		format?: string,
	) => string;
}

function TimelineRow({
	record,
	formatTimezoneAdjustedTimestamp,
}: TimelineRowProps): JSX.Element {
	const badge = alertStateBadge(record.state);

	return (
		<TableRow
			data-testid="timeline-row"
			className="tw:hover:bg-surface-sunken"
			onClick={(): void => {
				void logEvent('Alert history: Timeline table row: Clicked', {
					ruleId: record.ruleID,
					labels: record.labels,
				});
			}}
		>
			<TableCell>
				{badge ? (
					<StatusBadge tone={badge.tone} dot testId="timeline-row-state">
						{badge.label}
					</StatusBadge>
				) : (
					<span data-testid="timeline-row-state" />
				)}
			</TableCell>
			<TableCell className="tw:py-2.5 tw:whitespace-normal">
				<LabelChips labels={record.labels} testId="timeline-row-labels" />
			</TableCell>
			<TableCell
				className="tw:text-right tw:text-muted-foreground tw:tabular-nums"
				data-testid="timeline-row-created-at"
			>
				{formatTimezoneAdjustedTimestamp(
					record.unixMilli,
					DATE_TIME_FORMATS.DASH_DATETIME,
				)}
			</TableCell>
			<TableCell className="tw:w-24 tw:pr-4 tw:text-right">
				<TimelineRowActions record={record} />
			</TableCell>
		</TableRow>
	);
}

export default TimelineRow;
