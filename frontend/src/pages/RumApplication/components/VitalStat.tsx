import RatingChip from 'components/Rum/RatingChip';
import RatingSplitBar from 'components/Rum/RatingSplitBar';
import { VitalSummary } from 'lib/rum/metricTypes';
import { VitalName } from 'lib/rum/types';
import { formatVital, VITAL_TITLES } from 'lib/rum/vitals';

interface VitalStatProps {
	vital: VitalName;
	summary?: VitalSummary;
}

/** A vital's p75 with its rating and the good / needs-improvement / poor split. */
function VitalStat({ vital, summary }: VitalStatProps): JSX.Element {
	const name = vital.toUpperCase();
	const [value, unit] = summary
		? formatVital(vital, summary.p75).split(' ')
		: ['—'];
	return (
		<div
			data-testid={`rum-vital-${vital}`}
			className="tw:flex tw:flex-col tw:gap-1.5 tw:bg-surface-raised tw:px-5 tw:py-4"
		>
			<span className="tw:flex tw:items-center tw:justify-between tw:gap-2">
				<span
					title={VITAL_TITLES[vital]}
					className="tw:text-xs tw:font-medium tw:tracking-[0.05em] tw:text-muted-foreground tw:uppercase"
				>
					{name} p75
				</span>
				{summary && <RatingChip vital={vital} value={summary.p75} />}
			</span>
			<span className="tw:text-[26px] tw:leading-[1.15] tw:font-semibold tw:tracking-[-0.025em] tw:tabular-nums">
				{value}
				{unit && (
					<span className="tw:ml-1 tw:text-sm tw:font-normal tw:tracking-normal tw:text-muted-foreground">
						{unit}
					</span>
				)}
			</span>
			{summary ? (
				<RatingSplitBar counts={summary.counts} label={name} showLegend />
			) : (
				<span className="tw:text-xs tw:text-subtle-foreground">No samples</span>
			)}
		</div>
	);
}

export default VitalStat;
