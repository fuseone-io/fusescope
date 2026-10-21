import { ReactNode } from 'react';
import DeltaText, {
	DeltaTextTone,
} from 'components/PageTemplate/components/DeltaText';

interface MetricCellProps {
	value: ReactNode;
	delta?: { text: string; tone: DeltaTextTone };
}

/** A value and its change against the previous period, right-aligned. */
function MetricCell({ value, delta }: MetricCellProps): JSX.Element {
	return (
		<span className="tw:flex tw:flex-col tw:items-end tw:gap-0.5 tw:leading-tight tw:tabular-nums">
			{value}
			{delta && <DeltaText text={delta.text} tone={delta.tone} />}
		</span>
	);
}

export default MetricCell;
