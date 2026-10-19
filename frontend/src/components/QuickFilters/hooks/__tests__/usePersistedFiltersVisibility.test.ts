import { act, renderHook } from '@testing-library/react';

import usePersistedFiltersVisibility from '../usePersistedFiltersVisibility';

const KEY = 'SHOW_TEST_QUICK_FILTERS';

describe('usePersistedFiltersVisibility', () => {
	beforeEach(() => {
		localStorage.clear();
	});

	it('defaults to expanded', () => {
		const { result } = renderHook(() => usePersistedFiltersVisibility(KEY));
		expect(result.current[0]).toBe(true);
	});

	it('stays collapsed after a remount', () => {
		const first = renderHook(() => usePersistedFiltersVisibility(KEY));
		act(() => first.result.current[1]());
		expect(first.result.current[0]).toBe(false);
		first.unmount();

		const second = renderHook(() => usePersistedFiltersVisibility(KEY));
		expect(second.result.current[0]).toBe(false);

		act(() => second.result.current[1]());
		second.unmount();
		expect(
			renderHook(() => usePersistedFiltersVisibility(KEY)).result.current[0],
		).toBe(true);
	});

	it('keeps each explorer separate', () => {
		const traces = renderHook(() => usePersistedFiltersVisibility(KEY));
		act(() => traces.result.current[1]());

		const other = renderHook(() =>
			usePersistedFiltersVisibility('SHOW_OTHER_QUICK_FILTERS'),
		);
		expect(other.result.current[0]).toBe(true);
	});

	it('falls back to expanded when storage throws', () => {
		const spy = jest
			.spyOn(Storage.prototype, 'getItem')
			.mockImplementation(() => {
				throw new Error('blocked');
			});
		const { result } = renderHook(() => usePersistedFiltersVisibility(KEY));
		expect(result.current[0]).toBe(true);
		spy.mockRestore();
	});
});
