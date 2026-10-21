import { create } from 'zustand';

interface AllErrorsQueryState {
	isFetching: boolean;
	isCancelled: boolean;
	/** Exception groups matching the list's filters; null until counted. */
	groupCount: number | null;
	setIsFetching: (isFetching: boolean) => void;
	setIsCancelled: (isCancelled: boolean) => void;
	setGroupCount: (groupCount: number | null) => void;
}

export const useAllErrorsQueryState = create<AllErrorsQueryState>((set) => ({
	isFetching: false,
	isCancelled: false,
	groupCount: null,
	setIsFetching: (isFetching): void => {
		set((state) => ({
			isFetching,
			// Auto-reset cancelled when a new fetch starts
			isCancelled: isFetching ? false : state.isCancelled,
		}));
	},
	setIsCancelled: (isCancelled): void => {
		set({ isCancelled });
	},
	setGroupCount: (groupCount): void => {
		set({ groupCount });
	},
}));
