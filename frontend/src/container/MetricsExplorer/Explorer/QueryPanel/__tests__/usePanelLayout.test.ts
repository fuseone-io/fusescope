import { act, renderHook } from '@testing-library/react';

import { PANEL_LAYOUT_KEY, usePanelLayout } from '../usePanelLayout';

describe('usePanelLayout', () => {
	beforeEach(() => localStorage.clear());

	it('starts open at half the width', () => {
		const { result } = renderHook(() => usePanelLayout());

		expect(result.current.isCollapsed).toBe(false);
		expect(result.current.widthPercent).toBe(50);
	});

	it('collapses to the rail and restores, remembering it', () => {
		const { result, unmount } = renderHook(() => usePanelLayout());

		act(() => result.current.setCollapsed(true));
		expect(result.current.isCollapsed).toBe(true);
		unmount();

		const { result: next } = renderHook(() => usePanelLayout());
		expect(next.current.isCollapsed).toBe(true);
		act(() => next.current.setCollapsed(false));
		expect(
			JSON.parse(localStorage.getItem(PANEL_LAYOUT_KEY) ?? '{}'),
		).toStrictEqual({
			collapsed: false,
			widthPercent: 50,
		});
	});

	it('remembers the width, kept between 30% and 70%', () => {
		const { result, unmount } = renderHook(() => usePanelLayout());

		act(() => result.current.setWidthPercent(62));
		unmount();
		const { result: next } = renderHook(() => usePanelLayout());
		expect(next.current.widthPercent).toBe(62);

		act(() => next.current.setWidthPercent(95));
		expect(next.current.widthPercent).toBe(70);
		act(() => next.current.setWidthPercent(5));
		expect(next.current.widthPercent).toBe(30);
	});

	it('falls back to the defaults when storage is unreadable', () => {
		localStorage.setItem(PANEL_LAYOUT_KEY, '{not json');
		const { result } = renderHook(() => usePanelLayout());

		expect(result.current.widthPercent).toBe(50);
		expect(result.current.isCollapsed).toBe(false);
	});
});
