import KpiStrip from 'components/PageTemplate/components/KpiStrip';
import { Skeleton } from 'components/ui/skeleton';

import { formatMeterValue } from './formatMeterValue';
import { MeterChartState } from './useMeterBreakdown';

export interface MeterTotal {
	label: string;
	chart: MeterChartState;
}

/** Totals over the range, each summed from its chart's bars. */
function MeterTotals({ totals }: { totals: MeterTotal[] }): JSX.Element {
	return (
		<KpiStrip
			label="Totals"
			testId="meter-totals"
			className="tw:grid-cols-[repeat(auto-fit,minmax(220px,1fr))] tw:rounded-xl"
		>
			{totals.map(({ label, chart }) => {
				const metric =
					chart.widget.query.builder.queryData[0]?.aggregateAttribute?.key;
				const { value, unit } = formatMeterValue(
					chart.summary.total,
					chart.widget.yAxisUnit || 'short',
				);
				return (
					<div
						key={label}
						data-testid="meter-total"
						className="tw:flex tw:flex-col tw:gap-1 tw:bg-surface-raised tw:px-5 tw:py-4"
					>
						<span className="tw:text-[11px] tw:font-medium tw:tracking-[0.05em] tw:text-muted-foreground tw:uppercase">
							{label}
						</span>
						{chart.isLoading ? (
							<Skeleton className="tw:my-1 tw:h-7 tw:w-24 tw:bg-muted" />
						) : (
							<span className="tw:text-[28px] tw:leading-[1.15] tw:font-semibold tw:tracking-[-0.02em] tw:tabular-nums">
								{value}
								{unit && (
									<span className="tw:ml-1 tw:text-sm tw:font-normal tw:tracking-normal tw:text-muted-foreground">
										{unit}
									</span>
								)}
							</span>
						)}
						<span className="tw:font-mono tw:text-[11px] tw:text-subtle-foreground">
							{metric}
						</span>
					</div>
				);
			})}
		</KpiStrip>
	);
}

export default MeterTotals;
