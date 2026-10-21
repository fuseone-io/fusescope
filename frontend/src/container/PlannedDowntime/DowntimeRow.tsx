import { useState } from 'react';
import ConfigRowActions from 'components/Alerts/ConfigSectionHeader/ConfigRowActions';
import StatusBadge from 'components/PageTemplate/components/StatusBadge';
import TagChip from 'components/PageTemplate/components/TagChip';
import { TableCell, TableRow } from 'components/ui/table';
import dayjs from 'dayjs';
import { defaultTo } from 'lodash-es';

import { AlertRuleTags } from './AlertRuleTags';
import { DOWNTIME_STATUS } from './constants';
import { DowntimeDetails } from './DowntimeDetails';
import {
	formatDateTime,
	getDuration,
	recurrenceInfo,
} from './PlannedDowntimeutils';
import { DowntimeSchedulesTableData } from './types';

const VISIBLE_RULES = 2;

interface DowntimeRowProps {
	downtime: DowntimeSchedulesTableData;
	columnCount: number;
	onEdit?: () => void;
	onDelete?: () => void;
}

export function DowntimeRow({
	downtime,
	columnCount,
	onEdit,
	onDelete,
}: DowntimeRowProps): JSX.Element {
	const [expanded, setExpanded] = useState(false);
	const {
		name,
		scope,
		description,
		schedule,
		status,
		alertOptions,
		createdAt,
		createdBy,
		updatedAt,
		updatedBy,
	} = downtime;
	const statusInfo = status ? DOWNTIME_STATUS[status] : undefined;
	const subtitle = scope || description;
	const duration = schedule?.recurrence?.duration
		? schedule.recurrence.duration
		: getDuration(schedule?.startTime || '', schedule?.endTime || '');
	const hiddenRules = alertOptions.slice(VISIBLE_RULES);
	const toggle = (): void => setExpanded((open) => !open);

	return (
		<>
			<TableRow
				data-testid="planned-downtime-row"
				onClick={toggle}
				className="tw:cursor-pointer"
			>
				<TableCell className="tw:h-14 tw:max-w-[280px] tw:whitespace-normal">
					<span className="tw:block tw:truncate tw:font-medium tw:text-foreground">
						{defaultTo(name, '')}
					</span>
					{subtitle && (
						<span
							className="tw:block tw:truncate tw:font-mono tw:text-xs tw:text-muted-foreground"
							title={subtitle}
						>
							{subtitle}
						</span>
					)}
				</TableCell>
				<TableCell>
					{statusInfo ? (
						<StatusBadge tone={statusInfo.tone} dot>
							{statusInfo.label}
						</StatusBadge>
					) : (
						'—'
					)}
				</TableCell>
				<TableCell>
					{schedule?.startTime ? (
						<>
							<span className="tw:block tw:whitespace-nowrap tw:tabular-nums">
								{`${formatDateTime(schedule.startTime, schedule.timezone)} —`}
							</span>
							<span className="tw:block tw:whitespace-nowrap tw:tabular-nums">
								{formatDateTime(schedule.endTime, schedule.timezone)}
								<span className="tw:ml-1.5 tw:text-xs tw:text-subtle-foreground">
									{schedule.timezone}
								</span>
							</span>
						</>
					) : (
						'—'
					)}
				</TableCell>
				<TableCell className="tw:max-w-[240px] tw:text-xs tw:whitespace-normal tw:text-muted-foreground">
					{recurrenceInfo(schedule)}
				</TableCell>
				<TableCell>
					<StatusBadge tone="neutral">{duration}</StatusBadge>
				</TableCell>
				<TableCell className="tw:whitespace-normal">
					{alertOptions.length ? (
						<div className="tw:flex tw:max-w-[260px] tw:flex-wrap tw:gap-1">
							<AlertRuleTags
								closable={false}
								selectedTags={alertOptions.slice(0, VISIBLE_RULES)}
							/>
							{hiddenRules.length > 0 && (
								<TagChip
									title={hiddenRules.map((rule) => rule.label as string).join(', ')}
								>
									{`+${hiddenRules.length}`}
								</TagChip>
							)}
						</div>
					) : (
						<span className="tw:text-muted-foreground">All alert rules</span>
					)}
				</TableCell>
				<TableCell className="tw:w-px">
					<ConfigRowActions
						itemName={defaultTo(name, '')}
						expanded={expanded}
						onToggle={toggle}
						onEdit={onEdit}
						onDelete={onDelete}
						editTestId="edit-downtime"
						deleteTestId="delete-downtime"
					/>
				</TableCell>
			</TableRow>
			{expanded && (
				<TableRow className="tw:bg-surface-sunken tw:hover:bg-surface-sunken">
					<TableCell colSpan={columnCount} className="tw:py-4 tw:whitespace-normal">
						<DowntimeDetails
							created_at={createdAt ? dayjs(createdAt).toISOString() : ''}
							created_by_name={defaultTo(createdBy, '')}
							schedule={schedule}
							updated_at={updatedAt ? dayjs(updatedAt).toISOString() : ''}
							updated_by_name={defaultTo(updatedBy, '')}
							alertOptions={alertOptions}
						/>
					</TableCell>
				</TableRow>
			)}
		</>
	);
}
