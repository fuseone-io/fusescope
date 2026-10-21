import {
	DashboardtypesFillModeDTO,
	DashboardtypesHeatmapPaletteDTO,
	DashboardtypesHeatmapYScaleDTO,
	DashboardtypesLegendPositionDTO,
	DashboardtypesLineInterpolationDTO,
	DashboardtypesLineStyleDTO,
	DashboardtypesPrecisionOptionDTO,
	DashboardtypesStackModeDTO,
	DashboardtypesTextAlignDTO,
	DashboardtypesTimePreferenceDTO,
	DashboardtypesVerticalAlignDTO,
} from 'api/generated/services/fuseScope.schemas';
import { SectionKind } from 'pages/DashboardPage/DashboardContainer/Panels/types/sections';

import { type SectionSummaryInput, summarizeSection } from '../sectionSummary';

const base = {
	panelKind: 'signoz/TimeSeriesPanel' as const,
	legendSeriesCount: 0,
};

describe('summarizeSection', () => {
	it.each<[string, SectionSummaryInput, string]>([
		[
			'visualization: kind and global time',
			{
				...base,
				kind: SectionKind.Visualization,
				value: undefined,
				controls: { switchPanelKind: true, timePreference: true },
			},
			'Time Series · Global Time',
		],
		[
			'visualization: pinned time and zero-filled gaps',
			{
				...base,
				kind: SectionKind.Visualization,
				value: {
					timePreference: DashboardtypesTimePreferenceDTO.last_1_hr,
					fillSpans: true,
				},
				controls: { switchPanelKind: true, timePreference: true, fillSpans: true },
			},
			'Time Series · Last 1 hr · Missing as 0',
		],
		[
			'visualization: stacked bars',
			{
				...base,
				panelKind: 'signoz/BarChartPanel',
				kind: SectionKind.Visualization,
				value: { stackedBarChart: true },
				controls: { switchPanelKind: true, stacking: true },
			},
			'Bar Chart · Stacked',
		],
		[
			'visualization: area stack mode from the default',
			{
				...base,
				panelKind: 'signoz/AreaChartPanel',
				kind: SectionKind.Visualization,
				value: undefined,
				defaultValue: { stack: DashboardtypesStackModeDTO.percent },
				controls: { switchPanelKind: true, stackMode: true },
			},
			'Area Chart · 100%',
		],
		[
			'formatting: unit and decimals',
			{
				...base,
				kind: SectionKind.Formatting,
				value: {
					unit: 'ms',
					decimalPrecision: DashboardtypesPrecisionOptionDTO.NUMBER_2,
				},
				controls: { unit: true, decimals: true },
			},
			'Milliseconds (ms) · 2 decimals',
		],
		[
			'formatting: nothing set',
			{
				...base,
				kind: SectionKind.Formatting,
				value: undefined,
				controls: { unit: true, decimals: true },
			},
			'No unit · 2 decimals',
		],
		[
			'formatting: full precision, one decimal',
			{
				...base,
				kind: SectionKind.Formatting,
				value: { decimalPrecision: DashboardtypesPrecisionOptionDTO.full },
				controls: { decimals: true },
			},
			'Full precision',
		],
		[
			'formatting: column units',
			{
				...base,
				kind: SectionKind.Formatting,
				value: { columnUnits: { A: 'ms', B: 'bytes' } },
				controls: { decimals: true, columnUnits: true },
			},
			'2 decimals · 2 column units',
		],
		[
			'axes: auto',
			{
				...base,
				kind: SectionKind.Axes,
				value: undefined,
				controls: { minMax: true, logScale: true },
			},
			'Auto range · Linear',
		],
		[
			'axes: bounds and log scale',
			{
				...base,
				kind: SectionKind.Axes,
				value: { softMin: 0, softMax: 100, isLogScale: true },
				controls: { minMax: true, logScale: true },
			},
			'0 to 100 · Logarithmic',
		],
		[
			'axes: only a min',
			{
				...base,
				kind: SectionKind.Axes,
				value: { softMin: 5 },
				controls: { minMax: true },
			},
			'Min 5',
		],
		[
			'axes: heatmap bucket scale',
			{
				...base,
				kind: SectionKind.Axes,
				value: { y: { scale: DashboardtypesHeatmapYScaleDTO.log } },
				controls: { y: true },
			},
			'Log scale',
		],
		[
			'legend: position and series',
			{
				...base,
				legendSeriesCount: 4,
				kind: SectionKind.Legend,
				value: undefined,
				controls: { position: true },
			},
			'Below chart · 4 series',
		],
		[
			'legend: right with custom colors',
			{
				...base,
				legendSeriesCount: 1,
				kind: SectionKind.Legend,
				value: {
					position: DashboardtypesLegendPositionDTO.right,
					customColors: { a: '#fff', b: '#000' },
				},
				controls: { position: true },
			},
			'Right of chart · 1 series · 2 custom colors',
		],
		[
			'chart appearance: defaults',
			{
				...base,
				kind: SectionKind.ChartAppearance,
				value: undefined,
				controls: { lineStyle: true, lineInterpolation: true, fillMode: true },
			},
			'Solid · Straight · No fill',
		],
		[
			'chart appearance: dashed smooth gradient with points',
			{
				...base,
				kind: SectionKind.ChartAppearance,
				value: {
					lineStyle: DashboardtypesLineStyleDTO.dashed,
					lineInterpolation: DashboardtypesLineInterpolationDTO.spline,
					fillMode: DashboardtypesFillModeDTO.gradient,
					showPoints: true,
				},
				controls: {
					lineStyle: true,
					lineInterpolation: true,
					fillMode: true,
					showPoints: true,
				},
			},
			'Dashed · Smooth · Gradient fill · Points',
		],
		[
			'chart appearance: heatmap palette',
			{
				...base,
				kind: SectionKind.ChartAppearance,
				value: { colors: { palette: DashboardtypesHeatmapPaletteDTO.ember } },
				controls: { colors: true },
			},
			'Ember',
		],
		[
			'buckets: auto',
			{
				...base,
				kind: SectionKind.Buckets,
				value: undefined,
				controls: { count: true, width: true, mergeQueries: true },
			},
			'Auto buckets',
		],
		[
			'buckets: count and merged',
			{
				...base,
				kind: SectionKind.Buckets,
				value: { bucketCount: 20, mergeAllActiveQueries: true },
				controls: { count: true, width: true, mergeQueries: true },
			},
			'20 buckets · Combined',
		],
		[
			'buckets: width',
			{
				...base,
				kind: SectionKind.Buckets,
				value: { bucketWidth: 0.5 },
				controls: { count: true, width: true },
			},
			'Width 0.5',
		],
		[
			'thresholds: none',
			{ ...base, kind: SectionKind.Thresholds, value: [], controls: {} },
			'None',
		],
		[
			'thresholds: one',
			{
				...base,
				kind: SectionKind.Thresholds,
				value: [{ value: 80, color: 'Red' }],
				controls: {},
			},
			'1 threshold',
		],
		[
			'context links: two',
			{
				...base,
				kind: SectionKind.ContextLinks,
				value: [
					{ name: 'a', url: 'https://a' },
					{ name: 'b', url: 'https://b' },
				],
			},
			'2 links',
		],
		[
			'context links: none',
			{ ...base, kind: SectionKind.ContextLinks, value: undefined },
			'None',
		],
		[
			'text layout: defaults',
			{ ...base, kind: SectionKind.TextLayout, value: undefined },
			'Left · Top · Default background',
		],
		[
			'text layout: centred with a custom background',
			{
				...base,
				kind: SectionKind.TextLayout,
				value: {
					textAlign: DashboardtypesTextAlignDTO.center,
					verticalAlign: DashboardtypesVerticalAlignDTO.center,
					background: '#123456',
				},
			},
			'Center · Middle · Custom background',
		],
		[
			'text layout: a preset background',
			{
				...base,
				kind: SectionKind.TextLayout,
				value: { background: '#3A2A63' },
			},
			'Left · Top · Purple background',
		],
	])('%s', (_name, input, expected) => {
		expect(summarizeSection(input)).toBe(expected);
	});
});
