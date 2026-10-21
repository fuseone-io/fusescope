import { create } from 'zustand';

interface CompactEmptyValueState {
	/** Number panels whose tile is too short for the full empty state. */
	compactPanelIds: ReadonlySet<string>;
	setCompactPanelIds: (ids: string[]) => void;
}

export const useCompactEmptyValueStore = create<CompactEmptyValueState>(
	(set) => ({
		compactPanelIds: new Set(),
		setCompactPanelIds: (ids): void => set({ compactPanelIds: new Set(ids) }),
	}),
);
