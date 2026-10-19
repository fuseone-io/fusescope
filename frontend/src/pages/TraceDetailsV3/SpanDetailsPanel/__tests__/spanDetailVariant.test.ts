import setLocalStorageKey from 'api/browser/localstorage/set';
import { LOCALSTORAGE } from 'constants/localStorage';

import { SpanDetailVariant } from '../constants';
import { readSpanDetailVariant } from '../spanDetailVariant';

describe('readSpanDetailVariant', () => {
	afterEach(() => {
		localStorage.clear();
	});

	it('defaults to the right dock when nothing is stored', () => {
		expect(readSpanDetailVariant()).toBe(SpanDetailVariant.DOCKED_RIGHT);
	});

	it.each([
		SpanDetailVariant.DIALOG,
		SpanDetailVariant.DOCKED,
		SpanDetailVariant.DOCKED_RIGHT,
	])('restores the stored %s mode', (variant) => {
		setLocalStorageKey(LOCALSTORAGE.TRACE_DETAILS_SPAN_DETAILS_POSITION, variant);

		expect(readSpanDetailVariant()).toBe(variant);
	});

	it.each([SpanDetailVariant.DRAWER, 'bottom', ''])(
		'falls back to the right dock for a mode the page cannot show (%p)',
		(stored) => {
			setLocalStorageKey(LOCALSTORAGE.TRACE_DETAILS_SPAN_DETAILS_POSITION, stored);

			expect(readSpanDetailVariant()).toBe(SpanDetailVariant.DOCKED_RIGHT);
		},
	);
});
