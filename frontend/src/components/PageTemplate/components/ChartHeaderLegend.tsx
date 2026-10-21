import { cn } from 'lib/utils';

export interface ChartHeaderLegendItem {
	key: string;
	label: string;
	color: string;
	/** A trailing figure, e.g. the series total. */
	value?: string;
	/** Drawn faded: the series has no data in the range. */
	muted?: boolean;
}

interface ChartHeaderLegendProps {
	items: ChartHeaderLegendItem[];
	/** Keys of the series the chart hides. */
	hidden?: ReadonlySet<string>;
	/** Makes each item a switch that shows or hides its series. */
	onToggle?: (key: string) => void;
	mono?: boolean;
	testId?: string;
	className?: string;
}

/** A chart's series as one wrapping line of colour squares for its panel header. */
function ChartHeaderLegend({
	items,
	hidden,
	onToggle,
	mono = false,
	testId = 'chart-header-legend',
	className,
}: ChartHeaderLegendProps): JSX.Element {
	return (
		<div
			data-testid={testId}
			className={cn(
				'fs-ui tw:flex tw:min-w-0 tw:flex-wrap tw:items-center tw:gap-x-3 tw:gap-y-1 tw:font-sans tw:text-xs tw:text-muted-foreground',
				className,
			)}
		>
			{items.map((item) => {
				const shown = !hidden?.has(item.key);
				const content = (
					<>
						<span
							aria-hidden="true"
							className="tw:size-2 tw:flex-none tw:rounded-[2px]"
							style={{ background: item.color }}
						/>
						<span
							className={cn('tw:truncate', mono && 'tw:font-mono tw:text-[11px]')}
						>
							{item.label}
						</span>
						{item.value && (
							<span className="tw:text-subtle-foreground tw:tabular-nums">
								{item.value}
							</span>
						)}
					</>
				);
				const itemClass = cn(
					'tw:inline-flex tw:max-w-64 tw:items-center tw:gap-1.5',
					(item.muted || !shown) && 'tw:opacity-45',
					!shown && 'tw:line-through',
				);
				if (!onToggle) {
					return (
						<span key={item.key} className={itemClass}>
							{content}
						</span>
					);
				}
				return (
					<button
						key={item.key}
						type="button"
						role="switch"
						aria-checked={shown}
						aria-label={item.label}
						title={item.label}
						onClick={(): void => onToggle(item.key)}
						className={cn(
							itemClass,
							'tw:cursor-pointer tw:rounded-sm tw:border-0 tw:bg-transparent tw:p-0 tw:text-inherit tw:hover:text-foreground tw:focus-visible:outline-2 tw:focus-visible:outline-ring',
						)}
					>
						{content}
					</button>
				);
			})}
		</div>
	);
}

export default ChartHeaderLegend;
