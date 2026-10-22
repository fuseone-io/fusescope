import { RatingCounts } from 'lib/rum/types';
import { ratingShares } from 'lib/rum/vitals';
import { cn } from 'lib/utils';

interface RatingSplitBarProps {
	counts: RatingCounts;
	/** Names the vital for assistive tech, e.g. "LCP". */
	label: string;
	showLegend?: boolean;
	className?: string;
	testId?: string;
}

const LEGEND_DOT = 'tw:size-1.5 tw:rounded-full';

/** Good, needs-improvement and poor shares as one stacked bar. */
function RatingSplitBar({
	counts,
	label,
	showLegend = false,
	className,
	testId,
}: RatingSplitBarProps): JSX.Element {
	const shares = ratingShares(counts);
	const segments = [
		{ key: 'good', share: shares.good, className: 'tw:bg-success' },
		{
			key: 'needs-improvement',
			share: shares.needsImprovement,
			className: 'tw:bg-warning',
		},
		{ key: 'poor', share: shares.poor, className: 'tw:bg-error' },
	];
	return (
		<div
			data-testid={testId}
			className={cn('tw:flex tw:min-w-0 tw:flex-col tw:gap-1.5', className)}
		>
			<div
				role="img"
				aria-label={`${label}: good ${shares.good}%, needs improvement ${shares.needsImprovement}%, poor ${shares.poor}%`}
				className="tw:flex tw:h-1.5 tw:w-full tw:gap-px tw:overflow-hidden tw:rounded-full tw:bg-surface-sunken"
			>
				{segments
					.filter((segment) => segment.share > 0)
					.map((segment) => (
						<span
							key={segment.key}
							className={segment.className}
							style={{ width: `${segment.share}%` }}
						/>
					))}
			</div>
			{showLegend && (
				<span className="tw:flex tw:gap-3 tw:text-xs tw:text-muted-foreground tw:tabular-nums">
					{segments.map((segment) => (
						<span
							key={segment.key}
							className="tw:inline-flex tw:items-center tw:gap-1"
						>
							<span aria-hidden="true" className={cn(LEGEND_DOT, segment.className)} />
							{segment.share}%
						</span>
					))}
				</span>
			)}
		</div>
	);
}

export default RatingSplitBar;
