import { TelemetrytypesSignalDTO } from 'api/generated/services/fuseScope.schemas';
import { QueryMode } from 'types/api/queryBuilder/queryBuilderData';

import { getQueryPanelDefinition } from '../../../Panels/capabilities';
import {
	getQueryModeSignals,
	type SupportedQueryModesKindMap,
} from '../../../Panels/types/panelCapabilities';
import type { PanelKind } from '../../../Panels/types/panelKind';

const SIGNAL_ORDER = [
	TelemetrytypesSignalDTO.metrics,
	TelemetrytypesSignalDTO.logs,
	TelemetrytypesSignalDTO.traces,
];

const SIGNAL_NAME: Partial<Record<TelemetrytypesSignalDTO, string>> = {
	[TelemetrytypesSignalDTO.metrics]: 'metrics',
	[TelemetrytypesSignalDTO.logs]: 'logs',
	[TelemetrytypesSignalDTO.traces]: 'traces',
};

function signalsLabel(signals: TelemetrytypesSignalDTO[]): string | null {
	const names = signals.map((signal) => SIGNAL_NAME[signal] ?? signal);
	if (!names.length) {
		return null;
	}
	const text =
		names.length === 1
			? `${names[0]} only`
			: `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`;
	return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * What a kind can be fed, as short chips: the builder signals it takes, the raw
 * query languages it accepts, and "No PromQL" where metrics come only through
 * the builder.
 */
export function describeAcceptedData(
	modes: SupportedQueryModesKindMap | undefined,
): string[] {
	if (!modes || Object.keys(modes).length === 0) {
		return ['No query'];
	}
	const accepted = new Set([
		...getQueryModeSignals(modes, QueryMode.QUERY_BUILDER),
		...getQueryModeSignals(modes, QueryMode.AI_QUERY_BUILDER),
	]);
	const signals = SIGNAL_ORDER.filter((signal) => accepted.has(signal));
	const hasPromQL = QueryMode.PROM in modes;
	const chips = [
		signalsLabel(signals),
		hasPromQL && 'PromQL',
		QueryMode.CLICKHOUSE in modes && 'ClickHouse',
		!hasPromQL && accepted.has(TelemetrytypesSignalDTO.metrics) && 'No PromQL',
	];
	return chips.filter((chip): chip is string => Boolean(chip));
}

export function acceptedData(kind: PanelKind): string[] {
	return describeAcceptedData(
		getQueryPanelDefinition(kind)?.supportedQueryModesKindMap,
	);
}
