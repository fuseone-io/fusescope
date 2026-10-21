import { useCallback, useMemo } from 'react';
// eslint-disable-next-line no-restricted-imports
import { useDispatch, useSelector } from 'react-redux';
import { useHistory, useLocation } from 'react-router-dom';
import { QueryParams } from 'constants/query';
import {
	CustomTimeType,
	Time,
} from 'container/TopNav/DateTimeSelectionV2/types';
import { UpdateTimeInterval } from 'store/actions';
import { AppState } from 'store/reducers';
import { GlobalReducer } from 'types/reducer/globalTime';

const NANOSECONDS_PER_SECOND = 1_000_000_000;

interface DomainTimeRange {
	/** The global range in seconds, as the domain queries take it. */
	timeRange: { startTime: number; endTime: number };
	/** A chart selection (ms) becomes the global custom range. */
	handleTimeChange: (
		interval: Time | CustomTimeType,
		dateTimeRange?: [number, number],
	) => void;
}

/** The domain page follows the header time picker; drag-selects move it. */
export function useDomainTimeRange(): DomainTimeRange {
	const dispatch = useDispatch();
	const history = useHistory();
	const { pathname, search } = useLocation();
	const { maxTime, minTime } = useSelector<AppState, GlobalReducer>(
		(state) => state.globalTime,
	);

	const timeRange = useMemo(
		() => ({
			startTime: Math.floor(Number(minTime) / NANOSECONDS_PER_SECOND),
			endTime: Math.floor(Number(maxTime) / NANOSECONDS_PER_SECOND),
		}),
		[minTime, maxTime],
	);

	const handleTimeChange = useCallback(
		(interval: Time | CustomTimeType, dateTimeRange?: [number, number]): void => {
			if (interval !== 'custom' || !dateTimeRange) {
				return;
			}
			const [start, end] = dateTimeRange.map(Math.trunc);
			const params = new URLSearchParams(search);
			params.delete(QueryParams.relativeTime);
			params.set(QueryParams.startTime, String(start));
			params.set(QueryParams.endTime, String(end));
			history.push(`${pathname}?${params.toString()}`);
			dispatch(UpdateTimeInterval('custom', [start, end]));
		},
		[dispatch, history, pathname, search],
	);

	return { timeRange, handleTimeChange };
}
