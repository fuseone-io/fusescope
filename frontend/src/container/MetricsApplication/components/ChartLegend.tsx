import { LegendEntry } from './serviceChartSeries';

interface ChartLegendProps {
	entries: LegendEntry[];
}

/** The chart's series in its panel header: a swatch, dashed for the previous period. */
function ChartLegend({ entries }: ChartLegendProps): JSX.Element {
	return (
		<ul
			aria-label="Legend"
			data-testid="service-chart-legend"
			className="tw:m-0 tw:flex tw:list-none tw:flex-wrap tw:items-center tw:gap-x-3.5 tw:gap-y-1 tw:p-0 tw:text-xs tw:font-normal tw:text-muted-foreground"
		>
			{entries.map((entry) => (
				<li key={entry.key} className="tw:flex tw:items-center tw:gap-1.5">
					<span
						aria-hidden="true"
						className={
							entry.dashed
								? 'tw:h-0 tw:w-3.5 tw:border-t-2 tw:border-dashed'
								: 'tw:size-2 tw:rounded-[2px]'
						}
						style={
							entry.dashed ? { borderColor: entry.color } : { background: entry.color }
						}
					/>
					{entry.name}
				</li>
			))}
		</ul>
	);
}

export default ChartLegend;
