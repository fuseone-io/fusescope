import { useMemo } from 'react';
// eslint-disable-next-line no-restricted-imports
import { useSelector } from 'react-redux';
import { AppState } from 'store/reducers';
import { GlobalReducer } from 'types/reducer/globalTime';

import { getStepAlignedRange } from '../utils';

/** The `start`/`end` the service charts query with; see `getStepAlignedRange`. */
export function useStepAlignedRange(): { start: number; end: number } {
	const { minTime, maxTime } = useSelector<AppState, GlobalReducer>(
		(state) => state.globalTime,
	);
	return useMemo(
		() => getStepAlignedRange(minTime, maxTime),
		[minTime, maxTime],
	);
}
