import { ChartPointAnchor } from 'components/ChartPointPopover/types';
import { getYAxisFormattedValue } from 'components/Graph/yAxisConfig';
import { PrecisionOption } from 'components/Graph/types';
import uPlot from 'uplot';

import { PanelPoint } from '../pointMenu.types';

/** The point's x over the plot area, relative to `container`. */
export function getPointAnchor(
	plot: uPlot | null,
	container: HTMLElement | null,
	timestamp: number,
): ChartPointAnchor {
	if (!plot || !container) {
		return { left: 0, top: 0, height: 0 };
	}
	const over = plot.over.getBoundingClientRect();
	const box = container.getBoundingClientRect();
	return {
		left: over.left - box.left + plot.valToPos(timestamp, 'x'),
		top: over.top - box.top,
		height: over.height,
	};
}

export function formatPointValue(
	{ value, seriesName }: PanelPoint,
	yAxisUnit = 'none',
	decimalPrecision?: PrecisionOption,
): string | undefined {
	if (value === undefined || value === null) {
		return undefined;
	}
	const formatted = getYAxisFormattedValue(
		String(value),
		yAxisUnit,
		decimalPrecision,
	);
	return seriesName ? `${formatted} ${seriesName}` : formatted;
}
