import RatingChip from 'components/Rum/RatingChip';
import { VitalSummary } from 'lib/rum/metricTypes';
import { VitalName } from 'lib/rum/types';
import { formatVital } from 'lib/rum/vitals';

interface VitalCellProps {
	vital: VitalName;
	summary?: VitalSummary;
	testId?: string;
}

function VitalCell({ vital, summary, testId }: VitalCellProps): JSX.Element {
	if (!summary) {
		return <span className="tw:text-subtle-foreground">—</span>;
	}
	return (
		<span
			data-testid={testId}
			className="tw:flex tw:flex-col tw:items-start tw:gap-1"
		>
			<span className="tw:text-foreground tw:tabular-nums">
				{formatVital(vital, summary.p75)}
			</span>
			<RatingChip vital={vital} value={summary.p75} />
		</span>
	);
}

export default VitalCell;
