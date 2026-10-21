// eslint-disable-next-line no-restricted-imports
import { useSelector } from 'react-redux';
import { DATE_TIME_FORMATS } from 'constants/dateTimeFormats';
import { recordsTimePhrase } from 'container/LogsExplorerViews/recordCount';
import { useTimezone } from 'providers/Timezone';
import { AppState } from 'store/reducers';
import { GlobalReducer } from 'types/reducer/globalTime';

import { useAllErrorsQueryState } from './QueryStateContext';

/** "12 exception groups in the last 30 minutes", from the list's count request. */
function ExceptionsCountLine(): JSX.Element | null {
	const count = useAllErrorsQueryState((state) => state.groupCount);
	const { selectedTime, minTime, maxTime } = useSelector<
		AppState,
		GlobalReducer
	>((state) => state.globalTime);
	const { formatTimezoneAdjustedTimestamp } = useTimezone();

	if (count === null) {
		return null;
	}

	const phrase = recordsTimePhrase(
		selectedTime,
		formatTimezoneAdjustedTimestamp(
			minTime / 1e6,
			DATE_TIME_FORMATS.UK_DATETIME_SECONDS,
		),
		formatTimezoneAdjustedTimestamp(
			maxTime / 1e6,
			DATE_TIME_FORMATS.UK_DATETIME_SECONDS,
		),
	);

	const noun = count === 1 ? 'exception group' : 'exception groups';

	return (
		<span data-testid="exceptions-count">
			<strong className="tw:font-semibold tw:text-foreground tw:tabular-nums">
				{count.toLocaleString('en-US')}
			</strong>{' '}
			<span className="translate-safe">{`${noun} ${phrase}`}</span>
		</span>
	);
}

export default ExceptionsCountLine;
