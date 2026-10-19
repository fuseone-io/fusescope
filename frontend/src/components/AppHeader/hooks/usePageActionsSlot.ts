import { create } from 'zustand';

interface PageActionsSlotState {
	slot: HTMLElement | null;
	setSlot: (slot: HTMLElement | null) => void;
}

/** The header element pages render their actions into. */
export const usePageActionsSlot = create<PageActionsSlotState>((set) => ({
	slot: null,
	setSlot: (slot): void => set({ slot }),
}));
