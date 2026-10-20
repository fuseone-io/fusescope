import { useCallback, useState } from 'react';
import getLocalStorageKey from 'api/browser/localstorage/get';
import setLocalStorageKey from 'api/browser/localstorage/set';

export const PANEL_LAYOUT_KEY = 'metricsExplorerQueryPanel';

const MIN_WIDTH = 30;
const MAX_WIDTH = 70;
const DEFAULTS = { collapsed: false, widthPercent: 50 };

interface PanelLayout {
	collapsed: boolean;
	widthPercent: number;
}

function read(): PanelLayout {
	try {
		const stored = JSON.parse(getLocalStorageKey(PANEL_LAYOUT_KEY) || 'null');
		if (stored && typeof stored === 'object') {
			return {
				collapsed: stored.collapsed === true,
				widthPercent:
					typeof stored.widthPercent === 'number'
						? stored.widthPercent
						: DEFAULTS.widthPercent,
			};
		}
	} catch {
		// Unreadable or blocked storage: start from the defaults.
	}
	return DEFAULTS;
}

function write(layout: PanelLayout): void {
	// The layout is a convenience; a failed write is fine.
	setLocalStorageKey(PANEL_LAYOUT_KEY, JSON.stringify(layout));
}

/** The query panel's width and collapsed state, remembered per browser. */
export function usePanelLayout(): {
	isCollapsed: boolean;
	widthPercent: number;
	setCollapsed: (collapsed: boolean) => void;
	setWidthPercent: (percent: number) => void;
} {
	const [layout, setLayout] = useState<PanelLayout>(read);

	const update = useCallback((patch: Partial<PanelLayout>): void => {
		setLayout((prev) => {
			const next = { ...prev, ...patch };
			write(next);
			return next;
		});
	}, []);

	return {
		isCollapsed: layout.collapsed,
		widthPercent: layout.widthPercent,
		setCollapsed: useCallback(
			(collapsed: boolean): void => update({ collapsed }),
			[update],
		),
		setWidthPercent: useCallback(
			(percent: number): void =>
				update({
					widthPercent: Math.round(
						Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, percent)),
					),
				}),
			[update],
		),
	};
}
