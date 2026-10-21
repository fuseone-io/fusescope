import {
	DashboardtypesFillModeDTO,
	DashboardtypesHeatmapColorModeDTO,
	DashboardtypesHeatmapYScaleDTO,
	DashboardtypesLegendPositionDTO,
	DashboardtypesLineInterpolationDTO,
	DashboardtypesLineStyleDTO,
	DashboardtypesPrecisionOptionDTO,
	DashboardtypesTextAlignDTO,
	DashboardtypesTimePreferenceDTO,
	DashboardtypesVerticalAlignDTO,
} from 'api/generated/services/fuseScope.schemas';
import { getUniversalNameFromMetricUnit } from 'components/YAxisUnitSelector/utils';
import { resolveTextBackground } from 'pages/DashboardPage/DashboardContainer/Panels/kinds/TextPanel/background/resolveTextBackground';
import {
	PanelTheme,
	TextBackgroundKind,
} from 'pages/DashboardPage/DashboardContainer/Panels/kinds/TextPanel/background/types';
import { getPanelDefinition } from 'pages/DashboardPage/DashboardContainer/Panels/registry';
import type { PanelKind } from 'pages/DashboardPage/DashboardContainer/Panels/types/panelKind';
import {
	type SectionControls,
	SectionKind,
	type SectionSpecMap,
} from 'pages/DashboardPage/DashboardContainer/Panels/types/sections';
import { pluralize } from 'utils/pluralize';

import {
	DEFAULT_COLOR_MODE,
	DEFAULT_PALETTE,
} from '../sections/ChartAppearanceSection/heatmapColorOptions';
import {
	FILL_MODE_OPTIONS,
	LINE_INTERPOLATION_OPTIONS,
	LINE_STYLE_OPTIONS,
} from '../sections/ChartAppearanceSection/options';
import { DEFAULT_DECIMAL_PRECISION } from '../sections/FormattingSection/options';
import { POSITION_OPTIONS } from '../sections/LegendSection/options';
import {
	BAR_LAYOUT_OPTIONS,
	BarLayout,
	STACK_MODE_OPTIONS,
} from '../sections/VisualizationSection/options';
import { TIME_PREFERENCE_OPTIONS } from '../sections/VisualizationSection/timePreferenceOptions';

const SEPARATOR = ' · ';

interface SummaryContext {
	panelKind: PanelKind;
	/** Series the preview resolved, for the legend's count. */
	legendSeriesCount: number;
}

type InputFor<K extends SectionKind> = {
	kind: K;
	value: SectionSpecMap[K] | undefined;
	defaultValue?: SectionSpecMap[K];
} & (K extends keyof SectionControls
	? { controls: SectionControls[K] }
	: { controls?: undefined });

export type SectionSummaryInput = SummaryContext &
	{ [K in SectionKind]: InputFor<K> }[SectionKind];

function labelOf<T extends string>(
	items: { value: T; label: string }[],
	value: T | undefined,
): string | undefined {
	return items.find((item) => item.value === value)?.label;
}

function join(parts: (string | false | undefined | null)[]): string {
	return parts.filter(Boolean).join(SEPARATOR);
}

function capitalize(text: string): string {
	return text.charAt(0).toUpperCase() + text.slice(1);
}

function visualization(
	input: InputFor<SectionKind.Visualization> & SummaryContext,
): string {
	const { value, defaultValue, controls, panelKind } = input;
	const time =
		value?.timePreference ?? DashboardtypesTimePreferenceDTO.global_time;
	return join([
		controls.switchPanelKind && getPanelDefinition(panelKind).displayName,
		controls.timePreference && labelOf(TIME_PREFERENCE_OPTIONS, time),
		controls.stacking &&
			labelOf(
				BAR_LAYOUT_OPTIONS,
				value?.stackedBarChart ? BarLayout.STACKED : BarLayout.SIDE_BY_SIDE,
			),
		controls.stackMode &&
			labelOf(STACK_MODE_OPTIONS, value?.stack ?? defaultValue?.stack),
		controls.fillSpans && value?.fillSpans && 'Missing as 0',
	]);
}

function decimalsLabel(precision: DashboardtypesPrecisionOptionDTO): string {
	if (precision === DashboardtypesPrecisionOptionDTO.full) {
		return 'Full precision';
	}
	return pluralize(Number(precision), 'decimal');
}

function formatting({
	value,
	controls,
}: InputFor<SectionKind.Formatting>): string {
	const columnUnits = Object.keys(value?.columnUnits ?? {}).length;
	return join([
		controls.unit &&
			(value?.unit ? getUniversalNameFromMetricUnit(value.unit) : 'No unit'),
		controls.decimals &&
			decimalsLabel(value?.decimalPrecision ?? DEFAULT_DECIMAL_PRECISION),
		controls.columnUnits &&
			columnUnits > 0 &&
			pluralize(columnUnits, 'column unit'),
	]);
}

function isSet(bound: number | null | undefined): bound is number {
	return bound !== null && bound !== undefined;
}

function rangeLabel(
	min: number | null | undefined,
	max: number | null | undefined,
): string {
	if (isSet(min) && isSet(max)) {
		return `${min} to ${max}`;
	}
	if (isSet(min)) {
		return `Min ${min}`;
	}
	if (isSet(max)) {
		return `Max ${max}`;
	}
	return 'Auto range';
}

function axes({ value, controls }: InputFor<SectionKind.Axes>): string {
	if (controls.y) {
		const scale = value?.y?.scale ?? DashboardtypesHeatmapYScaleDTO.auto;
		return `${capitalize(scale)} scale`;
	}
	return join([
		controls.minMax && rangeLabel(value?.softMin, value?.softMax),
		controls.logScale && (value?.isLogScale ? 'Logarithmic' : 'Linear'),
	]);
}

function legend(input: InputFor<SectionKind.Legend> & SummaryContext): string {
	const { value, controls, legendSeriesCount } = input;
	const custom = Object.keys(value?.customColors ?? {}).length;
	return join([
		controls.position &&
			labelOf(
				POSITION_OPTIONS,
				value?.position ?? DashboardtypesLegendPositionDTO.bottom,
			),
		legendSeriesCount > 0 && `${legendSeriesCount} series`,
		custom > 0 && pluralize(custom, 'custom color'),
	]);
}

function fillLabel(fillMode: DashboardtypesFillModeDTO | undefined): string {
	if (!fillMode || fillMode === DashboardtypesFillModeDTO.none) {
		return 'No fill';
	}
	return `${labelOf(FILL_MODE_OPTIONS, fillMode)} fill`;
}

function chartAppearance({
	value,
	defaultValue,
	controls,
}: InputFor<SectionKind.ChartAppearance>): string {
	const pick = <F extends keyof NonNullable<typeof value>>(
		field: F,
	): NonNullable<typeof value>[F] | undefined =>
		value?.[field] ?? defaultValue?.[field];

	if (controls.colors) {
		const colors = pick('colors');
		const mode = colors?.mode ?? DEFAULT_COLOR_MODE;
		return mode === DashboardtypesHeatmapColorModeDTO.opacity
			? 'Opacity'
			: capitalize(colors?.palette ?? DEFAULT_PALETTE);
	}
	return join([
		controls.lineStyle &&
			labelOf(
				LINE_STYLE_OPTIONS,
				pick('lineStyle') ?? DashboardtypesLineStyleDTO.solid,
			),
		controls.lineInterpolation &&
			labelOf(
				LINE_INTERPOLATION_OPTIONS,
				pick('lineInterpolation') ?? DashboardtypesLineInterpolationDTO.linear,
			),
		controls.fillMode && fillLabel(pick('fillMode')),
		controls.showPoints && pick('showPoints') && 'Points',
	]);
}

function buckets({ value, controls }: InputFor<SectionKind.Buckets>): string {
	const sizing =
		(controls.count &&
			isSet(value?.bucketCount) &&
			pluralize(value.bucketCount, 'bucket')) ||
		(controls.width &&
			isSet(value?.bucketWidth) &&
			`Width ${value.bucketWidth}`) ||
		'Auto buckets';
	return join([
		sizing,
		controls.mergeQueries && value?.mergeAllActiveQueries && 'Combined',
	]);
}

function countOrNone(items: unknown[] | undefined, singular: string): string {
	return items?.length ? pluralize(items.length, singular) : 'None';
}

const TEXT_ALIGN_LABEL: Record<DashboardtypesTextAlignDTO, string> = {
	left: 'Left',
	center: 'Center',
	right: 'Right',
};

const VERTICAL_ALIGN_LABEL: Record<DashboardtypesVerticalAlignDTO, string> = {
	top: 'Top',
	center: 'Middle',
	bottom: 'Bottom',
};

function backgroundLabel(stored: string | null | undefined): string {
	const resolved = resolveTextBackground(stored, PanelTheme.Light);
	switch (resolved.kind) {
		case TextBackgroundKind.None:
			return 'Transparent';
		case TextBackgroundKind.Preset:
			return `${capitalize(resolved.preset ?? '')} background`;
		case TextBackgroundKind.Custom:
			return 'Custom background';
		default:
			return 'Default background';
	}
}

function textLayout({ value }: InputFor<SectionKind.TextLayout>): string {
	return join([
		TEXT_ALIGN_LABEL[value?.textAlign ?? DashboardtypesTextAlignDTO.left],
		VERTICAL_ALIGN_LABEL[
			value?.verticalAlign ?? DashboardtypesVerticalAlignDTO.top
		],
		backgroundLabel(value?.background),
	]);
}

/** A collapsed section's one-line reading of what it holds. */
export function summarizeSection(input: SectionSummaryInput): string {
	switch (input.kind) {
		case SectionKind.Visualization:
			return visualization(input);
		case SectionKind.Formatting:
			return formatting(input);
		case SectionKind.Axes:
			return axes(input);
		case SectionKind.Legend:
			return legend(input);
		case SectionKind.ChartAppearance:
			return chartAppearance(input);
		case SectionKind.Buckets:
			return buckets(input);
		case SectionKind.Thresholds:
			return countOrNone(input.value, 'threshold');
		case SectionKind.ContextLinks:
			return countOrNone(input.value, 'link');
		case SectionKind.TextLayout:
			return textLayout(input);
		default:
			return '';
	}
}
