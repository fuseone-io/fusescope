import { SelectProps } from 'antd';
import type { DefaultOptionType } from 'antd/es/select';
import { getInvolvedQueriesInTraceOperator } from 'components/QueryBuilderV2/QueryV2/TraceOperator/utils/utils';
import { Time } from 'container/TopNav/DateTimeSelectionV2/types';
import getStartEndRangeTime from 'lib/getStartEndRangeTime';
import getStep from 'lib/getStep';
import {
	IBuilderFormula,
	IBuilderQuery,
	IBuilderTraceOperator,
	IClickHouseQuery,
	IPromQLQuery,
	Query,
} from 'types/api/queryBuilder/queryBuilderData';
import { EQueryType } from 'types/common/dashboard';

// toChartInterval converts eval window to chart selection time interval
export const toChartInterval = (evalWindow: string | undefined): Time => {
	switch (evalWindow) {
		case '1m0s':
			return '1m';
		case '5m0s':
			return '5m';
		case '10m0s':
			return '10m';
		case '15m0s':
			return '15m';
		case '30m0s':
			return '30m';
		case '1h0m0s':
			return '1h';
		case '3h0m0s':
			return '3h';
		case '4h0m0s':
			return '4h';
		case '6h0m0s':
			return '6h';
		case '12h0m0s':
			return '12h';
		case '24h0m0s':
			return '1d';
		default:
			return '5m';
	}
};

export const getUpdatedStepInterval = (evalWindow?: string): number => {
	const { start, end } = getStartEndRangeTime({
		type: 'GLOBAL_TIME',
		interval: toChartInterval(evalWindow),
	});
	return getStep({
		start,
		end,
		inputFormat: 'ns',
	});
};

export const getSelectedQueryOptions = (
	queries:
		| Array<
				| IBuilderQuery
				| IBuilderTraceOperator
				| IBuilderFormula
				| IClickHouseQuery
				| IPromQLQuery
		  >
		| undefined
		| null,
): SelectProps['options'] => {
	if (!queries) {
		return [];
	}
	return queries
		.filter((query) => !query.disabled)
		.map((query) => ({
			label: 'queryName' in query ? query.queryName : query.name,
			value: 'queryName' in query ? query.queryName : query.name,
		}));
};

export function getQueryNames(currentQuery: Query): DefaultOptionType[] {
	const involvedQueriesInTraceOperator = getInvolvedQueriesInTraceOperator(
		currentQuery.builder.queryTraceOperator,
	);
	const queryConfig: Record<EQueryType, () => SelectProps['options']> = {
		[EQueryType.QUERY_BUILDER]: () => [
			...(getSelectedQueryOptions(currentQuery.builder.queryData)?.filter(
				(option) =>
					!involvedQueriesInTraceOperator.includes(option.value as string),
			) || []),
			...(getSelectedQueryOptions(currentQuery.builder.queryFormulas) || []),
			...(getSelectedQueryOptions(currentQuery.builder.queryTraceOperator) || []),
		],
		[EQueryType.PROM]: () => getSelectedQueryOptions(currentQuery.promql),
		[EQueryType.CLICKHOUSE]: () =>
			getSelectedQueryOptions(currentQuery.clickhouse_sql),
	};

	// queryType comes from the URL, so it can name an Object.prototype member.
	if (!Object.hasOwn(queryConfig, currentQuery.queryType)) {
		return [];
	}

	return queryConfig[currentQuery.queryType]() || [];
}
