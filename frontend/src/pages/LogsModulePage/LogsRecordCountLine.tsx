// eslint-disable-next-line no-restricted-imports
import { useSelector } from 'react-redux';
import { recordsTimePhrase } from 'container/LogsExplorerViews/recordCount';
import { useLogsRecordCount } from 'container/LogsExplorerViews/useLogsRecordCount';
import { DATE_TIME_FORMATS } from 'constants/dateTimeFormats';
import { useTimezone } from 'providers/Timezone';
import { AppState } from 'store/reducers';
import { GlobalReducer } from 'types/reducer/globalTime';

/** "9,254 records in the last 30 minutes", from the explorer's frequency chart. */
function LogsRecordCountLine(): JSX.Element | null {
	const count = useLogsRecordCount((state) => state.count);
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

	return (
		<span data-testid="logs-record-count">
			<strong className="tw:font-semibold tw:text-foreground tw:tabular-nums">
				{count.toLocaleString()}
			</strong>{' '}
			records {phrase}
		</span>
	);
}

export default LogsRecordCountLine;
