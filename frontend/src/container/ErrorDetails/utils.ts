import { QueryParams } from 'constants/query';
import {
	initialQueryBuilderFormValuesMap,
	initialQueryState,
} from 'constants/queryBuilder';
import ROUTES from 'constants/routes';
import { Exception } from 'types/api/errors/getAll';
import {
	BaseAutocompleteData,
	DataTypes,
} from 'types/api/queryBuilder/queryAutocompleteResponse';
import { LogsAggregatorOperator } from 'types/common/queryBuilder';

const LOGS_WINDOW_MS = 15 * 60 * 1000;

export function traceUrl(traceId: string, spanId: string): string {
	const path = ROUTES.TRACE_DETAIL.replace(':id', traceId);
	return spanId ? `${path}?spanId=${spanId}` : path;
}

/** The logs explorer filtered to one trace, 15 minutes either side of `timestamp`. */
export function traceLogsUrl(traceId: string, timestamp: string): string {
	const at = Date.parse(timestamp);
	const traceIdKey: BaseAutocompleteData = {
		key: 'trace_id',
		id: 'trace-id-key',
		dataType: DataTypes.String,
		type: '',
	};
	const compositeQuery = {
		...initialQueryState,
		queryType: 'builder',
		builder: {
			...initialQueryState.builder,
			queryData: [
				{
					...initialQueryBuilderFormValuesMap.logs,
					aggregateOperator: LogsAggregatorOperator.NOOP,
					filter: { expression: `trace_id = '${traceId}'` },
					filters: {
						op: 'AND',
						items: [
							{ id: 'trace-id-filter', key: traceIdKey, op: '=', value: traceId },
						],
					},
				},
			],
		},
	};
	const search = new URLSearchParams();
	search.set(QueryParams.compositeQuery, JSON.stringify(compositeQuery));
	search.set(QueryParams.startTime, String(at - LOGS_WINDOW_MS));
	search.set(QueryParams.endTime, String(at + LOGS_WINDOW_MS));
	return `${ROUTES.LOGS_EXPLORER}?${search.toString()}`;
}

export function findGroup(
	rows: Exception[] | undefined,
	groupID: string,
): Exception | undefined {
	return rows?.find((row) => row.groupID === groupID);
}

/**
 * The global range in nanoseconds, stretched to hold the event, so a link to
 * an event outside the selected range still finds its group.
 */
export function groupSummaryWindow(
	minTime: number,
	maxTime: number,
	timestamp: string,
): [number, number] {
	const at = Date.parse(timestamp) * 1e6;
	return [Math.min(minTime, at), Math.max(maxTime, at)];
}
