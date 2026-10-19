import { create } from 'zustand';

interface LogsRecordCountState {
	/** Records the frequency chart counted, or null when it is off or loading. */
	count: number | null;
	setCount: (count: number | null) => void;
}

/** Hands the explorer's record count to the page header, which sits above it. */
export const useLogsRecordCount = create<LogsRecordCountState>((set) => ({
	count: null,
	setCount: (count): void => set({ count }),
}));
