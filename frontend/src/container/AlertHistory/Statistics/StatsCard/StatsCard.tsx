import TitleTooltip from 'components/PageTemplate/components/TitleTooltip';
import { QueryParams } from 'constants/query';
import useUrlQuery from 'hooks/useUrlQuery';
import { cn } from 'lib/utils';
import { Calendar } from 'lucide-react';
import { AlertRuleStats } from 'types/api/alerts/def';
import { calculateChange } from 'utils/calculateChange';

import ChangePercentage from './ChangePercentage';
import StatsGraph from './StatsGraph/StatsGraph';
import {
	convertTimestampToLocaleDateString,
	extractDayFromTimestamp,
} from './utils';

type StatsCardProps = {
	totalCurrentCount?: number;
	totalPastCount?: number;
	title: string;
	isEmpty?: boolean;
	emptyMessage?: string;
	displayValue?: string | number;
	timeSeries?: AlertRuleStats['currentTriggersSeries']['values'];
};

function StatsCard({
	displayValue,
	totalCurrentCount,
	totalPastCount,
	title,
	isEmpty,
	emptyMessage,
	timeSeries = [],
}: StatsCardProps): JSX.Element {
	const urlQuery = useUrlQuery();

	const relativeTime = urlQuery.get('relativeTime');

	const { changePercentage, changeDirection } = calculateChange(
		totalCurrentCount,
		totalPastCount,
	);

	const startTime = urlQuery.get(QueryParams.startTime);
	const endTime = urlQuery.get(QueryParams.endTime);

	let displayTime = relativeTime;

	if (!displayTime && startTime && endTime) {
		const formattedStartDate = extractDayFromTimestamp(startTime);
		const formattedEndDate = extractDayFromTimestamp(endTime);
		displayTime = `${formattedStartDate} to ${formattedEndDate}`;
	}

	if (!displayTime) {
		displayTime = '';
	}
	const formattedStartTimeForTooltip =
		convertTimestampToLocaleDateString(startTime);
	const formattedEndTimeForTooltip = convertTimestampToLocaleDateString(endTime);

	return (
		<div
			className="tw:flex tw:min-h-[188px] tw:min-w-0 tw:flex-col tw:gap-2 tw:bg-surface-raised tw:px-5 tw:pt-4 tw:pb-3"
			data-testid="stats-card"
			data-stats-title={title}
			data-empty={isEmpty ? 'true' : 'false'}
		>
			<div className="tw:flex tw:items-center tw:justify-between tw:gap-2">
				<span className="tw:text-xs tw:font-medium tw:tracking-[0.05em] tw:text-muted-foreground tw:uppercase">
					{title}
				</span>
				{displayTime && (
					<TitleTooltip
						title={
							relativeTime
								? undefined
								: `From ${formattedStartTimeForTooltip} to ${formattedEndTimeForTooltip}`
						}
					>
						<span className="tw:inline-flex tw:items-center tw:gap-1 tw:text-xs tw:text-subtle-foreground tw:tabular-nums">
							<Calendar aria-hidden="true" className="tw:size-3.5" />
							{displayTime}
						</span>
					</TitleTooltip>
				)}
			</div>

			<div
				className={cn(
					isEmpty
						? 'tw:pt-1.5 tw:pb-1 tw:text-sm tw:text-muted-foreground'
						: 'tw:text-[26px] tw:leading-[1.15] tw:font-semibold tw:tracking-[-0.025em] tw:tabular-nums',
				)}
				data-testid="stats-card-value"
			>
				{isEmpty ? emptyMessage : displayValue || totalCurrentCount}
			</div>

			<div>
				<ChangePercentage
					direction={changeDirection}
					percentage={changePercentage}
					duration={relativeTime}
				/>
			</div>

			<div className="tw:mt-auto tw:h-14 tw:w-full">
				{!isEmpty && timeSeries.length > 1 && (
					<StatsGraph timeSeries={timeSeries} changeDirection={changeDirection} />
				)}
			</div>
		</div>
	);
}

StatsCard.defaultProps = {
	totalCurrentCount: 0,
	totalPastCount: 0,
	isEmpty: false,
	emptyMessage: 'No Data',
	displayValue: '',
	timeSeries: [],
};

export default StatsCard;
