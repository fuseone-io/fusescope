import RatingChip from 'components/Rum/RatingChip';
import RatingSplitBar from 'components/Rum/RatingSplitBar';
import { VitalSummary } from 'lib/rum/metricTypes';
import { VitalName } from 'lib/rum/types';
import { formatVital } from 'lib/rum/vitals';

interface VitalCellProps {
	vital: VitalName;
	route: string;
	summary?: VitalSummary;
}

/** A route's p75 with its rating, over the good / NI / poor split of its samples. */
function VitalCell({ vital, route, summary }: VitalCellProps): JSX.Element {
	if (!summary) {
		return <span className="tw:text-subtle-foreground">—</span>;
	}
	return (
		<span
			data-testid={`rum-views-${vital}`}
			className="tw:flex tw:min-w-[104px] tw:flex-col tw:gap-1.5"
		>
			<span className="tw:flex tw:items-center tw:gap-2">
				<span className="tw:tabular-nums">{formatVital(vital, summary.p75)}</span>
				<RatingChip vital={vital} value={summary.p75} />
			</span>
			<RatingSplitBar
				counts={summary.counts}
				label={`${vital.toUpperCase()} of ${route}`}
			/>
		</span>
	);
}

export default VitalCell;
