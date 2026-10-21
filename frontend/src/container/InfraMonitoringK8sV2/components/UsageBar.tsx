import { cn } from 'lib/utils';

interface UsageBarProps {
	/** Percent; the bar is capped at 100 while the text shows the real value. */
	percent: number;
	color: string;
	className?: string;
}

/** A 6px usage bar with its percentage, coloured by the caller's threshold. */
function UsageBar({ percent, color, className }: UsageBarProps): JSX.Element {
	const width = Math.min(100, Math.max(0, percent));

	return (
		<span
			className={cn(
				'fs-ui tw:flex tw:w-full tw:min-w-0 tw:items-center tw:gap-2 tw:font-sans',
				className,
			)}
		>
			<span
				aria-hidden="true"
				className="tw:block tw:h-1.5 tw:min-w-16 tw:flex-1 tw:overflow-hidden tw:rounded-full tw:bg-muted"
			>
				<span
					className="tw:block tw:h-full tw:rounded-full"
					style={{ width: `${width}%`, background: color }}
				/>
			</span>
			<span className="tw:min-w-11 tw:text-right tw:text-xs tw:text-foreground tw:tabular-nums">
				{percent}%
			</span>
		</span>
	);
}

export default UsageBar;
