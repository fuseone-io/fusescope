import { useMemo, useRef } from 'react';
import ContentPanel from 'components/PageTemplate/components/ContentPanel';
import { Skeleton } from 'components/ui/skeleton';
import { LegendPosition } from 'lib/uPlotV2/components/types';
import { prepareChartData } from 'lib/uPlotV2/utils/dataUtils';
import BarChart from 'lib/visualization/charts/BarChart/BarChart';
import { useIsDarkMode } from 'hooks/useDarkMode';
import { useResizeObserver } from 'hooks/useDimensions';
import { useTimezone } from 'providers/Timezone';
import uPlot from 'uplot';

import { buildMeterChartConfig } from '../Explorer/configBuilder';
import { formatMeterValue } from './formatMeterValue';
import { MeterChartState } from './useMeterBreakdown';

interface MeterChartPanelProps {
	title: string;
	chart: MeterChartState;
	color: string;
	minTimeScale?: number;
	maxTimeScale?: number;
	onDragSelect: (start: number, end: number) => void;
}

const join = ({ value, unit }: { value: string; unit: string }): string =>
	unit ? `${value} ${unit}` : value;

/** One meter as hourly bars, with its total and peak in the header. */
function MeterChartPanel({
	title,
	chart,
	color,
	minTimeScale,
	maxTimeScale,
	onDragSelect,
}: MeterChartPanelProps): JSX.Element {
	const graphRef = useRef<HTMLDivElement>(null);
	const { width, height } = useResizeObserver(graphRef);
	const isDarkMode = useIsDarkMode();
	const { timezone } = useTimezone();
	const { widget, response, summary, isLoading } = chart;
	const unit = widget.yAxisUnit || 'short';

	const config = useMemo(
		() =>
			buildMeterChartConfig({
				id: `meter-breakdown-${widget.id}`,
				isDarkMode,
				currentQuery: widget.query,
				onDragSelect,
				apiResponse: response,
				timezone,
				yAxisUnit: unit,
				minTimeScale,
				maxTimeScale,
				seriesColor: color,
			}),
		[
			widget,
			isDarkMode,
			onDragSelect,
			response,
			timezone,
			unit,
			minTimeScale,
			maxTimeScale,
			color,
		],
	);
	const data = useMemo(
		() => (response ? prepareChartData(response) : []),
		[response],
	);

	return (
		<ContentPanel
			testId="meter-chart"
			title={
				<>
					{title}
					<span className="tw:font-normal tw:text-subtle-foreground">
						· per hour
					</span>
				</>
			}
			actions={
				summary.hasData ? (
					<span
						data-testid="meter-chart-summary"
						className="tw:text-xs tw:text-muted-foreground tw:tabular-nums"
					>
						{join(formatMeterValue(summary.total, unit))} total · peak{' '}
						{join(formatMeterValue(summary.peak, unit))}
					</span>
				) : undefined
			}
		>
			<div ref={graphRef} className="tw:h-[180px] tw:px-3 tw:pb-3">
				{isLoading && <Skeleton className="tw:h-full tw:w-full tw:bg-muted" />}
				{!isLoading && !summary.hasData && (
					<p className="fs-ui tw:flex tw:h-full tw:items-center tw:justify-center tw:font-sans tw:text-[13px] tw:text-muted-foreground">
						No usage in this range
					</p>
				)}
				{!isLoading && summary.hasData && width > 0 && height > 0 && (
					<BarChart
						config={config}
						data={data as uPlot.AlignedData}
						width={width}
						height={height}
						showLegend={false}
						legendConfig={{ position: LegendPosition.BOTTOM }}
						yAxisUnit={unit}
						timezone={timezone}
					/>
				)}
			</div>
		</ContentPanel>
	);
}

export default MeterChartPanel;
