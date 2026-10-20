import { ReactNode } from 'react';
import { cn } from 'lib/utils';

import { ChartHeading } from './chartHeading';

interface ChartPanelTitleProps {
	heading: ChartHeading;
	/** Rendered after the title, e.g. a missing-unit warning. */
	adornment?: ReactNode;
}

/** Query letters, metric or formula, and what it aggregates. */
function ChartPanelTitle({
	heading,
	adornment,
}: ChartPanelTitleProps): JSX.Element {
	return (
		<div className="fs-ui tw:flex tw:min-w-0 tw:flex-col tw:font-sans">
			<h3 className="tw:flex tw:min-w-0 tw:items-center tw:gap-2 tw:text-sm tw:font-semibold tw:text-foreground">
				{heading.letters.map((letter) => (
					<span
						key={letter}
						className={cn(
							'tw:inline-flex tw:h-[22px] tw:min-w-[22px] tw:flex-none tw:items-center tw:justify-center tw:rounded-sm tw:px-1 tw:text-xs tw:font-semibold',
							letter.startsWith('F')
								? 'tw:bg-brand-secondary-soft tw:text-brand-secondary-ink'
								: 'tw:bg-primary-soft tw:text-primary-ink',
						)}
					>
						{letter}
					</span>
				))}
				<span
					className={cn(
						'tw:truncate tw:text-[13px] tw:font-medium',
						heading.isCode && 'tw:font-mono',
					)}
				>
					{heading.title}
				</span>
				{adornment}
			</h3>
			{heading.subtitle && (
				<p className="tw:mt-0.5 tw:truncate tw:text-xs tw:text-muted-foreground">
					{heading.subtitle}
				</p>
			)}
		</div>
	);
}

export default ChartPanelTitle;
