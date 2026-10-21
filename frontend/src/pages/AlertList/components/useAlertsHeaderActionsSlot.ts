import { create } from 'zustand';

interface AlertsHeaderActionsSlotState {
	slot: HTMLElement | null;
	setSlot: (slot: HTMLElement | null) => void;
}

/** The element in the Alerts header band that tab content renders its actions into. */
export const useAlertsHeaderActionsSlot = create<AlertsHeaderActionsSlotState>(
	(set) => ({
		slot: null,
		setSlot: (slot): void => set({ slot }),
	}),
);
