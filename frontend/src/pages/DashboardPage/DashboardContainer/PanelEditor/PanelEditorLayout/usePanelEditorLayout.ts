import { useCallback, useState } from 'react';
import getLocalStorageKey from 'api/browser/localstorage/get';
import setLocalStorageKey from 'api/browser/localstorage/set';

export const PANEL_EDITOR_LAYOUT_KEY = 'panelEditorLayout';

export const QUERY_PANEL_WIDTH = { min: 320, max: 760, default: 400 };

export interface PanelEditorLayoutState {
	queryWidth: number;
	queryCollapsed: boolean;
	settingsCollapsed: boolean;
}

const DEFAULTS: PanelEditorLayoutState = {
	queryWidth: QUERY_PANEL_WIDTH.default,
	queryCollapsed: false,
	settingsCollapsed: false,
};

function clampWidth(width: number): number {
	return Math.round(
		Math.min(QUERY_PANEL_WIDTH.max, Math.max(QUERY_PANEL_WIDTH.min, width)),
	);
}

function read(): PanelEditorLayoutState {
	try {
		const stored: unknown = JSON.parse(
			getLocalStorageKey(PANEL_EDITOR_LAYOUT_KEY) || 'null',
		);
		if (!stored || typeof stored !== 'object' || Array.isArray(stored)) {
			return DEFAULTS;
		}
		const { queryWidth, queryCollapsed, settingsCollapsed } = stored as Record<
			string,
			unknown
		>;
		return {
			queryWidth:
				typeof queryWidth === 'number'
					? clampWidth(queryWidth)
					: DEFAULTS.queryWidth,
			queryCollapsed: queryCollapsed === true,
			settingsCollapsed: settingsCollapsed === true,
		};
	} catch {
		return DEFAULTS;
	}
}

function write(layout: PanelEditorLayoutState): void {
	try {
		setLocalStorageKey(PANEL_EDITOR_LAYOUT_KEY, JSON.stringify(layout));
	} catch {
		// A convenience only; blocked storage keeps the in-memory layout.
	}
}

/** The editor's query panel width and which side panes are collapsed, remembered per browser. */
export function usePanelEditorLayout(): {
	layout: PanelEditorLayoutState;
	setQueryWidth: (width: number) => void;
	setQueryCollapsed: (collapsed: boolean) => void;
	setSettingsCollapsed: (collapsed: boolean) => void;
} {
	const [layout, setLayout] = useState<PanelEditorLayoutState>(read);

	const update = useCallback((patch: Partial<PanelEditorLayoutState>): void => {
		setLayout((prev) => {
			const next = { ...prev, ...patch };
			write(next);
			return next;
		});
	}, []);

	return {
		layout,
		setQueryWidth: useCallback(
			(width: number): void => update({ queryWidth: clampWidth(width) }),
			[update],
		),
		setQueryCollapsed: useCallback(
			(queryCollapsed: boolean): void => update({ queryCollapsed }),
			[update],
		),
		setSettingsCollapsed: useCallback(
			(settingsCollapsed: boolean): void => update({ settingsCollapsed }),
			[update],
		),
	};
}
