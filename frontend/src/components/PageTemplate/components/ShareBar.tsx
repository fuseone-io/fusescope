import { cn } from 'lib/utils';

interface ShareBarProps {
	/** Share in percent, 0–100. */
	value: number;
	tone?: 'primary' | 'error';
	/** Text after the bar, e.g. the formatted share. */
	text?: string;
	className?: string;
}

/** A share bar with its number, for "% time spent" or error-rate columns. */
function ShareBar({
	value,
	tone = 'primary',
	text,
	className,
}: ShareBarProps): JSX.Element {
	const width = Math.min(100, Math.max(0, value));
	return (
		<span className={cn('tw:flex tw:items-center tw:gap-2.5', className)}>
			<span
				aria-hidden="true"
				className="tw:block tw:h-1.5 tw:min-w-12 tw:flex-1 tw:overflow-hidden tw:rounded-full tw:bg-muted"
			>
				<span
					className={cn(
						'tw:block tw:h-full tw:rounded-full',
						tone === 'error' ? 'tw:bg-error' : 'tw:bg-primary',
					)}
					style={{ width: `${width}%` }}
				/>
			</span>
			{text !== undefined && (
				<span className="tw:min-w-11 tw:text-right tw:text-xs tw:text-muted-foreground tw:tabular-nums">
					{text}
				</span>
			)}
		</span>
	);
}

export default ShareBar;
