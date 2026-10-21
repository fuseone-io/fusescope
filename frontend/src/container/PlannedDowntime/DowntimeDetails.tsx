import type { DefaultOptionType } from 'antd/es/select';
import type { AlertmanagertypesScheduleDTO } from 'api/generated/services/fuseScope.schemas';
import ConfigDetailItem from 'components/Alerts/ConfigSectionHeader/ConfigDetailItem';

import { AlertRuleTags } from './AlertRuleTags';
import { formatDateTime, recurrenceInfo } from './PlannedDowntimeutils';

interface DowntimeDetailsProps {
	created_at?: string;
	created_by_name?: string;
	created_by_email?: string;
	schedule?: AlertmanagertypesScheduleDTO;
	updated_at?: string;
	updated_by_name?: string;
	alertOptions?: DefaultOptionType[];
}

/** Who scheduled a downtime, its window and the rules it silences. */
export function DowntimeDetails({
	created_at,
	created_by_name,
	created_by_email,
	schedule,
	updated_at,
	updated_by_name,
	alertOptions,
}: DowntimeDetailsProps): JSX.Element {
	const startTime = formatDateTime(schedule?.startTime, schedule?.timezone);
	const endTime = formatDateTime(schedule?.endTime, schedule?.timezone);

	return (
		<dl className="tw:m-0 tw:flex tw:flex-col tw:gap-2.5 tw:text-[13px]">
			<ConfigDetailItem
				title="Created by"
				value={
					created_by_name ? (
						<span className="tw:flex tw:items-center tw:gap-2">
							{created_by_name}
							{created_by_email && (
								<span className="tw:text-muted-foreground">{created_by_email}</span>
							)}
						</span>
					) : (
						'-'
					)
				}
			/>
			<ConfigDetailItem
				title="Created on"
				value={created_at ? formatDateTime(created_at) : '-'}
			/>
			{updated_at && (
				<ConfigDetailItem title="Updated on" value={formatDateTime(updated_at)} />
			)}
			{updated_by_name && (
				<ConfigDetailItem title="Updated by" value={updated_by_name} />
			)}
			<ConfigDetailItem
				title="Timeframe"
				value={schedule?.startTime ? `${startTime} — ${endTime}` : '-'}
			/>
			<ConfigDetailItem title="Timezone" value={schedule?.timezone || '-'} />
			<ConfigDetailItem title="Repeats" value={recurrenceInfo(schedule)} />
			<ConfigDetailItem
				title="Alerts silenced"
				value={
					alertOptions?.length ? (
						<AlertRuleTags closable={false} selectedTags={alertOptions} />
					) : (
						'All alert rules'
					)
				}
			/>
		</dl>
	);
}
