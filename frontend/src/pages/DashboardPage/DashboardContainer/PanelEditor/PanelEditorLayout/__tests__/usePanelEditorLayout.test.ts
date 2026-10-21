import { act, renderHook } from '@testing-library/react';

import {
	PANEL_EDITOR_LAYOUT_KEY,
	QUERY_PANEL_WIDTH,
	usePanelEditorLayout,
} from '../usePanelEditorLayout';

describe('usePanelEditorLayout', () => {
	beforeEach(() => localStorage.clear());

	it('starts with both panes open at the default query width', () => {
		const { result } = renderHook(() => usePanelEditorLayout());

		expect(result.current.layout).toStrictEqual({
			queryWidth: QUERY_PANEL_WIDTH.default,
			queryCollapsed: false,
			settingsCollapsed: false,
		});
	});

	it('remembers collapsed panes and the query width across mounts', () => {
		const { result, unmount } = renderHook(() => usePanelEditorLayout());

		act(() => result.current.setQueryCollapsed(true));
		act(() => result.current.setSettingsCollapsed(true));
		act(() => result.current.setQueryWidth(520));
		unmount();

		const { result: next } = renderHook(() => usePanelEditorLayout());
		expect(next.current.layout).toStrictEqual({
			queryWidth: 520,
			queryCollapsed: true,
			settingsCollapsed: true,
		});
	});

	it.each([
		[100, QUERY_PANEL_WIDTH.min],
		[5000, QUERY_PANEL_WIDTH.max],
		[431.6, 432],
	])('keeps a %spx query width at %spx', (requested, kept) => {
		const { result } = renderHook(() => usePanelEditorLayout());

		act(() => result.current.setQueryWidth(requested));
		expect(result.current.layout.queryWidth).toBe(kept);
	});

	it.each([
		['unparsable', '{not json'],
		['the wrong shape', '[1,2]'],
		['wrong field types', '{"queryWidth":"wide","queryCollapsed":"yes"}'],
	])('falls back to the defaults when storage holds %s', (_name, stored) => {
		localStorage.setItem(PANEL_EDITOR_LAYOUT_KEY, stored);
		const { result } = renderHook(() => usePanelEditorLayout());

		expect(result.current.layout).toStrictEqual({
			queryWidth: QUERY_PANEL_WIDTH.default,
			queryCollapsed: false,
			settingsCollapsed: false,
		});
	});

	it('keeps working when storage throws', () => {
		const getItem = jest
			.spyOn(Storage.prototype, 'getItem')
			.mockImplementation(() => {
				throw new Error('blocked');
			});
		const setItem = jest
			.spyOn(Storage.prototype, 'setItem')
			.mockImplementation(() => {
				throw new Error('blocked');
			});

		const { result } = renderHook(() => usePanelEditorLayout());
		act(() => result.current.setQueryCollapsed(true));

		expect(result.current.layout.queryCollapsed).toBe(true);
		getItem.mockRestore();
		setItem.mockRestore();
	});
});
