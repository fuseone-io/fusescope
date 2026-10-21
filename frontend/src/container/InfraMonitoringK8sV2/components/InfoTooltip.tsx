import { MouseEventHandler, ReactNode } from 'react';
import TitleTooltip from 'components/PageTemplate/components/TitleTooltip';
import { cn } from 'lib/utils';
import { Info } from 'lucide-react';

interface InfoTooltipProps {
	title: ReactNode;
	className?: string;
	testId?: string;
}

// The tooltip renders inside a sortable header, through a portal that still
// bubbles React events to it.
const stopPropagation: MouseEventHandler = (e): void => e.stopPropagation();

/** An info icon beside a header, explaining it on hover or focus. */
function InfoTooltip({
	title,
	className,
	testId,
}: InfoTooltipProps): JSX.Element {
	return (
		<TitleTooltip
			title={
				<div role="presentation" onClick={stopPropagation}>
					{title}
				</div>
			}
		>
			<button
				type="button"
				aria-label="More information"
				data-testid={testId}
				onClick={stopPropagation}
				className={cn(
					'tw:inline-flex tw:flex-none tw:cursor-help tw:items-center tw:border-0 tw:bg-transparent tw:p-0 tw:text-subtle-foreground tw:hover:text-foreground',
					className,
				)}
			>
				<Info size={14} aria-hidden="true" />
			</button>
		</TitleTooltip>
	);
}

export default InfoTooltip;
