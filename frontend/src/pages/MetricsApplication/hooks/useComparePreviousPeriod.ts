import { useCallback, useState } from 'react';

export const COMPARE_PREVIOUS_PERIOD_KEY = 'SERVICE_COMPARE_PREVIOUS_PERIOD';

function readStored(): boolean {
	try {
		return window.localStorage.getItem(COMPARE_PREVIOUS_PERIOD_KEY) !== 'false';
	} catch {
		return true;
	}
}

/** The service page's "Compare with previous period" switch, remembered per browser. */
export function useComparePreviousPeriod(): [
	boolean,
	(value: boolean) => void,
] {
	const [compare, setCompare] = useState(readStored);
	const update = useCallback((value: boolean): void => {
		setCompare(value);
		try {
			window.localStorage.setItem(COMPARE_PREVIOUS_PERIOD_KEY, String(value));
		} catch {
			// Storage can be unavailable; the switch still works for this visit.
		}
	}, []);
	return [compare, update];
}
