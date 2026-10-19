import { useMemo } from 'react';
import { DEFAULT_ENTITY_VERSION } from 'constants/app';
import {
	initialFilters,
	initialQueriesMap,
	PANEL_TYPES,
} from 'constants/queryBuilder';
import { Time } from 'container/TopNav/DateTimeSelectionV2/types';
import { useGetQueryRange } from 'hooks/queryBuilder/useGetQueryRange';
import cloneDeep from 'lodash-es/cloneDeep';
import { TagFilter } from 'types/api/queryBuilder/queryBuilderData';
import { QueryDataV3 } from 'types/api/widgets/getQuery';
import { LogsAggregatorOperator } from 'types/common/queryBuilder';

import { countFromResult } from './countFromResult';

import './styles.scss';

function LogsCountInInterval({
	filter,
	timeInterval,
}: LogsCountInIntervalProps): JSX.Element | null {
	const query = useMemo(() => {
		const q = cloneDeep(initialQueriesMap.logs);
		q.builder.queryData[0] = {
			...q.builder.queryData[0],
			filters: filter || initialFilters,
			aggregateOperator: LogsAggregatorOperator.COUNT,
		};
		return q;
	}, [filter]);

	const result = useGetQueryRange(
		{
			graphType: PANEL_TYPES.TABLE,
			query,
			selectedTime: 'GLOBAL_TIME',
			globalSelectedInterval: timeInterval,
		},
		DEFAULT_ENTITY_VERSION,
	);

	// The v3 count arrives as a series that the legacy `QueryData` type omits.
	const count = countFromResult(
		(result?.data?.payload?.data?.newResult?.data?.result?.[0] ??
			result?.data?.payload?.data?.result?.[0]) as QueryDataV3 | undefined,
	);

	if (!result.isFetched || count === undefined) {
		return null;
	}

	return (
		<div className="logs-filter-preview-matched-logs-count">
			<span>{Number(count).toLocaleString()}</span> matches in
		</div>
	);
}

interface LogsCountInIntervalProps {
	filter: TagFilter;
	timeInterval: Time;
}

export default LogsCountInInterval;
