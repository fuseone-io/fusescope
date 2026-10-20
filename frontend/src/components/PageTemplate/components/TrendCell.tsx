import { ReactNode } from 'react';
import { cn } from 'lib/utils';

import DeltaText, { DeltaTextTone } from './DeltaText';
import Sparkline from './Sparkline';

interface TrendCellProps {
	value: ReactNode;
	values?: number[];
	strokeClassName?: string;
	delta?: { text: string; tone: DeltaTextTone };
	valueClassName?: string;
	className?: string;
}

/** A table cell with a sparkline, the value and its change against the previous period. */
function TrendCell({
	value,
	values = [],
	strokeClassName,
	delta,
	valueClassName,
	className,
}: TrendCellProps): JSX.Element {
	return (
		<span
			className={cn(
				'tw:flex tw:items-center tw:justify-end tw:gap-2.5',
				className,
			)}
		>
			<Sparkline values={values} strokeClassName={strokeClassName} />
			<span className="tw:flex tw:min-w-[76px] tw:flex-col tw:items-end tw:leading-tight">
				<span className={cn('tw:tabular-nums', valueClassName)}>{value}</span>
				{delta && <DeltaText text={delta.text} tone={delta.tone} />}
			</span>
		</span>
	);
}

export default TrendCell;
