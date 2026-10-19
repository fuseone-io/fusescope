import { SpanV3 } from 'types/api/trace/getTraceV3';

import { getSpanGroupValue } from '../utils';
import {
	ColorPair,
	generateColorPair,
	RESERVED_ERROR,
} from './generateColorPair';

export interface ColorLegendItem extends ColorPair {
	label: string;
}

export interface ColorLegend {
	items: ColorLegendItem[];
	hasErrors: boolean;
	errorColor: string;
}

/** The colour-by groups of `spans` with their colours, plus whether any span is painted as an error. */
export function getColorLegend(
	spans: SpanV3[],
	colorByFieldName: string,
): ColorLegend {
	const seen = new Set<string>();
	const items: ColorLegendItem[] = [];
	let hasErrors = false;

	spans.forEach((span) => {
		hasErrors = hasErrors || span.has_error;
		const label = getSpanGroupValue(span, colorByFieldName);
		if (!seen.has(label)) {
			seen.add(label);
			items.push({ label, ...generateColorPair(label) });
		}
	});

	return { items, hasErrors, errorColor: RESERVED_ERROR };
}
