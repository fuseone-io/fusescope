import { useMemo } from 'react';
import ChartHeaderLegend from 'components/PageTemplate/components/ChartHeaderLegend';
import { useSeriesVisibility } from 'components/PageTemplate/hooks/useSeriesVisibility';
import { Timezone } from 'components/CustomTimePicker/timezoneUtils';
import { LegendPosition } from 'lib/uPlotV2/components/types';
import { UPlotConfigBuilder } from 'lib/uPlotV2/config/UPlotConfigBuilder';
import { StackMode } from 'lib/uPlotV2/config/types';
import BarChart from 'lib/visualization/charts/BarChart/BarChart';
import { MetricRangePayloadProps } from 'types/api/metrics/getQueryRange';
import uPlot from 'uplot';

import { formatMeterValue } from '../Breakdown/formatMeterValue';
import { seriesTotals } from '../meterTotals';

interface MeterResultChartProps {
	config: UPlotConfigBuilder;
	data: uPlot.AlignedData;
	response: MetricRangePayloadProps | undefined;
	width: number;
	height: number;
	yAxisUnit: string;
	timezone: Timezone;
}

const join = ({ value, unit }: { value: string; unit: string }): string =>
	unit ? `${value} ${unit}` : value;

/** Stacked bars with each series' total in a header legend that toggles it. */
function MeterResultChart({
	config,
	data,
	response,
	width,
	height,
	yAxisUnit,
	timezone,
}: MeterResultChartProps): JSX.Element {
	const { plotRef, hidden, toggle } = useSeriesVisibility();
	const items = useMemo(() => {
		const totals = seriesTotals(response);
		return Object.values(config.getLegendItems()).map((item, index) => ({
			key: String(item.label ?? ''),
			label: String(item.label ?? ''),
			color: typeof item.color === 'string' ? item.color : '',
			value: join(formatMeterValue(totals[index] ?? 0, yAxisUnit)),
		}));
	}, [config, response, yAxisUnit]);

	return (
		<div className="tw:flex tw:h-full tw:flex-col tw:gap-3">
			<ChartHeaderLegend
				items={items}
				hidden={hidden}
				onToggle={toggle}
				mono
				testId="meter-result-legend"
			/>
			<BarChart
				stack={StackMode.Normal}
				config={config}
				legendConfig={{ position: LegendPosition.BOTTOM }}
				showLegend={false}
				plotRef={plotRef}
				data={data}
				width={width}
				height={Math.max(height - 36, 120)}
				yAxisUnit={yAxisUnit}
				timezone={timezone}
			/>
		</div>
	);
}

export default MeterResultChart;
