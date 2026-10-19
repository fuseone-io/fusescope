import getLocalStorageKey from 'api/browser/localstorage/get';
import { LOCALSTORAGE } from 'constants/localStorage';

import { SpanDetailVariant } from './constants';

const PAGE_VARIANTS: readonly string[] = [
	SpanDetailVariant.DIALOG,
	SpanDetailVariant.DOCKED,
	SpanDetailVariant.DOCKED_RIGHT,
];

function isPageVariant(value: string | null): value is SpanDetailVariant {
	return value !== null && PAGE_VARIANTS.includes(value);
}

/** The stored span panel mode, or the right dock when none or one the page cannot show is stored. */
export function readSpanDetailVariant(): SpanDetailVariant {
	const stored = getLocalStorageKey(
		LOCALSTORAGE.TRACE_DETAILS_SPAN_DETAILS_POSITION,
	);
	return isPageVariant(stored) ? stored : SpanDetailVariant.DOCKED_RIGHT;
}
