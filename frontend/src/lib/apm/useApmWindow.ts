import { useMemo } from 'react';
// eslint-disable-next-line no-restricted-imports
import { useSelector } from 'react-redux';
import { AppState } from 'store/reducers';
import { GlobalReducer } from 'types/reducer/globalTime';

import { ApmWindow, apmWindow } from './window';

/** The global time range as a query window. */
export function useApmWindow(): ApmWindow {
	const { minTime, maxTime } = useSelector<AppState, GlobalReducer>(
		(state) => state.globalTime,
	);
	return useMemo(() => apmWindow(minTime, maxTime), [minTime, maxTime]);
}
