import StatusBadge from 'components/PageTemplate/components/StatusBadge';
import RatingSplitBar from 'components/Rum/RatingSplitBar';
import { RATING_LABELS, RATING_TONES } from 'components/Rum/constants';
import {
	appStartThresholdsText,
	rateAppStart,
	StartType,
} from 'lib/rum/appStart';
import { VitalSummary } from 'lib/rum/metricTypes';
import { formatVital } from 'lib/rum/vitals';

interface AppStartStatProps {
	type: StartType;
	summary?: VitalSummary;
}

const TITLES: Record<StartType, string> = {
	cold: 'Cold start p75',
	warm: 'Warm start p75',
	hot: 'Hot start p75',
};

/** An app start type's p75 with its rating and the good / needs-improvement / poor split. */
function AppStartStat({ type, summary }: AppStartStatProps): JSX.Element {
	const [value, unit] = summary
		? formatVital('lcp', summary.p75).split(' ')
		: ['—'];
	const rating = summary && rateAppStart(type, summary.p75);
	return (
		<div
			data-testid={`rum-app-start-${type}`}
			className="tw:flex tw:flex-col tw:gap-1.5 tw:bg-surface-raised tw:px-5 tw:py-4"
		>
			<span className="tw:flex tw:items-center tw:justify-between tw:gap-2">
				<span
					title={`App start, ${type} — ${appStartThresholdsText(type)}`}
					className="tw:text-xs tw:font-medium tw:tracking-[0.05em] tw:text-muted-foreground tw:uppercase"
				>
					{TITLES[type]}
				</span>
				{rating && (
					<StatusBadge tone={RATING_TONES[rating]} dot>
						{RATING_LABELS[rating]}
					</StatusBadge>
				)}
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
				<RatingSplitBar counts={summary.counts} label={TITLES[type]} showLegend />
			) : (
				<span className="tw:text-xs tw:text-subtle-foreground">No samples</span>
			)}
		</div>
	);
}

export default AppStartStat;
