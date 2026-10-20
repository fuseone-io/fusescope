import { create } from 'zustand';

interface MetricsCountState {
	/** Metrics the summary list counted, or null while it loads or fails. */
	count: number | null;
	setCount: (count: number | null) => void;
}

/** Hands the summary list's total to the page header, which sits above it. */
export const useMetricsCount = create<MetricsCountState>((set) => ({
	count: null,
	setCount: (count): void => set({ count }),
}));
