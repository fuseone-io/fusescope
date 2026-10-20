import { act, renderHook } from '@testing-library/react';

import {
	COMPARE_PREVIOUS_PERIOD_KEY,
	useComparePreviousPeriod,
} from '../useComparePreviousPeriod';

describe('useComparePreviousPeriod', () => {
	beforeEach(() => window.localStorage.clear());

	it('compares by default', () => {
		const { result } = renderHook(() => useComparePreviousPeriod());
		expect(result.current[0]).toBe(true);
	});

	it('remembers the switch for the next visit', () => {
		const first = renderHook(() => useComparePreviousPeriod());
		act(() => first.result.current[1](false));
		expect(first.result.current[0]).toBe(false);
		expect(window.localStorage.getItem(COMPARE_PREVIOUS_PERIOD_KEY)).toBe(
			'false',
		);

		const next = renderHook(() => useComparePreviousPeriod());
		expect(next.result.current[0]).toBe(false);
	});
});
