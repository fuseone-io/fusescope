// eslint-disable-next-line no-restricted-imports
import { createContext, useContext } from 'react';

/**
 * What the editor's frame lends the panes inside it: collapsing them to their
 * rails, and which query card is open, so a rail letter can open its card.
 */
export interface PanelEditorChrome {
	collapseQueryPanel: () => void;
	settingsCollapsed: boolean;
	setSettingsCollapsed: (collapsed: boolean) => void;
	/** `undefined` until a card is chosen: the first query is open then. */
	openQuery: string | null | undefined;
	setOpenQuery: (name: string | null) => void;
}

const PanelEditorChromeContext = createContext<PanelEditorChrome | null>(null);

export const PanelEditorChromeProvider = PanelEditorChromeContext.Provider;

/** Null outside the full-page editor (the View modal keeps the tabbed builder). */
export function usePanelEditorChrome(): PanelEditorChrome | null {
	return useContext(PanelEditorChromeContext);
}
