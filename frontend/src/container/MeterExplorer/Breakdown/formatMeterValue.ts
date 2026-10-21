import { getYAxisFormattedValue } from 'components/Graph/yAxisConfig';

/** A meter total in the chart's unit, split into number and unit for a KPI. */
export function formatMeterValue(
	value: number,
	unit: string,
): { value: string; unit: string } {
	const formatted = getYAxisFormattedValue(String(value), unit);
	const match = /^(-?[\d.,]+)\s*(.*)$/.exec(formatted);
	return match
		? { value: match[1], unit: match[2] }
		: { value: formatted, unit: '' };
}
