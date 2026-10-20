import { FS_SERIES_DARK, FS_SERIES_LIGHT } from 'constants/fuseScopeColors';

import { PREVIOUS_PERIOD_SUFFIX } from '../MetricsPageQueries/previousPeriod';

/** Red is kept out of the series palettes; errors draw in the theme's error ink. */
const ERROR_COLOR = { dark: '#f87171', light: '#dc2626' };

export type SeriesColor =
	| 'blue'
	| 'sky'
	| 'magenta'
	| 'green'
	| 'slate'
	| 'error';

export interface ChartSeries {
	/** The query or formula legend the chart labels the series with. */
	legend: string;
	/** What the panel header calls it. */
	name: string;
	color: SeriesColor;
}

export interface ChartSeriesSpec {
	series: ChartSeries[];
	/** Legends that get a previous-period copy; all of them when unset. */
	compared?: string[];
	previousColor: SeriesColor;
}

export const LATENCY_SERIES: ChartSeriesSpec = {
	series: [
		{ legend: 'p50', name: 'p50', color: 'blue' },
		{ legend: 'p90', name: 'p90', color: 'sky' },
		{ legend: 'p99', name: 'p99', color: 'magenta' },
	],
	compared: ['p99'],
	previousColor: 'magenta',
};

export const RATE_SERIES: ChartSeriesSpec = {
	series: [{ legend: 'Operations', name: 'requests', color: 'blue' }],
	previousColor: 'slate',
};

export const ERROR_SERIES: ChartSeriesSpec = {
	series: [{ legend: 'Error Percentage', name: 'error rate', color: 'error' }],
	previousColor: 'slate',
};

export const APDEX_SERIES: ChartSeriesSpec = {
	series: [{ legend: 'Apdex', name: 'apdex', color: 'green' }],
	previousColor: 'slate',
};

export function seriesHex(color: SeriesColor, isDarkMode: boolean): string {
	if (color === 'error') {
		return isDarkMode ? ERROR_COLOR.dark : ERROR_COLOR.light;
	}
	return (isDarkMode ? FS_SERIES_DARK : FS_SERIES_LIGHT)[color];
}

export interface LegendEntry {
	key: string;
	name: string;
	color: string;
	dashed: boolean;
}

/** Colours by legend for the chart, and the entries the panel header lists. */
export function chartColors(
	spec: ChartSeriesSpec,
	compare: boolean,
	isDarkMode: boolean,
): { colors: Record<string, string>; entries: LegendEntry[] } {
	const entries: LegendEntry[] = spec.series.map((item) => ({
		key: item.legend,
		name: item.name,
		color: seriesHex(item.color, isDarkMode),
		dashed: false,
	}));
	const colors = Object.fromEntries(
		entries.map((entry) => [entry.key, entry.color]),
	);
	if (!compare) {
		return { colors, entries };
	}
	const compared = spec.series.filter(
		(item) => !spec.compared || spec.compared.includes(item.legend),
	);
	const previousColor = seriesHex(spec.previousColor, isDarkMode);
	const previous = compared.map((item) => ({
		key: `${item.legend}${PREVIOUS_PERIOD_SUFFIX}`,
		name:
			compared.length > 1 || spec.compared
				? `${item.name}, previous period`
				: 'previous period',
		color: previousColor,
		dashed: true,
	}));
	return {
		colors: {
			...colors,
			...Object.fromEntries(previous.map((entry) => [entry.key, entry.color])),
		},
		entries: [...entries, ...previous],
	};
}
