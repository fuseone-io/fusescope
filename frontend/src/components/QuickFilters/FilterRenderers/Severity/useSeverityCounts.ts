import { useMemo } from 'react';
import { ENTITY_VERSION_V5 } from 'constants/app';
import { PANEL_TYPES } from 'constants/queryBuilder';
import { useGetExplorerQueryRange } from 'hooks/queryBuilder/useGetExplorerQueryRange';
import { useQueryBuilder } from 'hooks/queryBuilder/useQueryBuilder';
import { Query } from 'types/api/queryBuilder/queryBuilderData';
import { QueryDataV3 } from 'types/api/widgets/getQuery';
import { DataTypes } from 'types/api/queryBuilder/queryAutocompleteResponse';
import { LogsAggregatorOperator } from 'types/common/queryBuilder';
import { NormalizedSeverity } from 'utils/logSeverity';

import {
	applySeverityLevels,
	groupSeverityCounts,
	SeverityCountRow,
	withoutSeverityItems,
} from './severityFilterQuery';

/** The staged query counted per severity_number and text, without its severity filter. */
function buildCountQuery(stagedQuery: Query, queryIndex: number): Query {
	const base = stagedQuery.builder.queryData[queryIndex];
	return {
		...stagedQuery,
		builder: {
			...stagedQuery.builder,
			queryFormulas: [],
			queryData: [
				{
					...base,
					disabled: false,
					aggregateOperator: LogsAggregatorOperator.COUNT,
					aggregations: [{ expression: 'count()' }],
					filter: {
						expression: applySeverityLevels(base.filter?.expression || '', null),
					},
					filters: {
						op: base.filters?.op || 'AND',
						items: withoutSeverityItems(base.filters?.items || []),
					},
					groupBy: [
						{
							key: 'severity_number',
							dataType: DataTypes.Int64,
							type: '',
							id: 'severity_number--int64----true',
						},
						{
							key: 'severity_text',
							dataType: DataTypes.String,
							type: '',
							id: 'severity_text--string----true',
						},
					],
					orderBy: [],
					having: { expression: '' },
					limit: null,
					legend: '',
				},
			],
		},
	};
}

function toRows(result: QueryDataV3 | undefined): SeverityCountRow[] {
	const table = result?.table;
	if (!table) {
		return [];
	}
	const valueColumn = table.columns.find((column) => column.isValueColumn);
	return table.rows.map((row) => ({
		severityNumber: Number(row.data.severity_number) || 0,
		severityText: String(row.data.severity_text ?? ''),
		count:
			Number(valueColumn ? row.data[valueColumn.id ?? valueColumn.name] : 0) || 0,
	}));
}

/** Log counts per normalised severity for the current filter and time range. */
export function useSeverityCounts({
	queryIndex,
	enabled,
}: {
	queryIndex: number;
	enabled: boolean;
}): {
	counts: { level: NormalizedSeverity; count: number }[];
	isLoading: boolean;
} {
	const { stagedQuery } = useQueryBuilder();

	const countQuery = useMemo(
		() =>
			stagedQuery?.builder.queryData[queryIndex]
				? buildCountQuery(stagedQuery, queryIndex)
				: null,
		[stagedQuery, queryIndex],
	);

	const { data, isLoading } = useGetExplorerQueryRange(
		countQuery,
		PANEL_TYPES.TABLE,
		ENTITY_VERSION_V5,
		{ enabled: enabled && !!countQuery },
		{},
		false,
	);

	const counts = useMemo(() => {
		const result = (data?.payload?.data?.newResult?.data?.result ||
			data?.payload?.data?.result ||
			[]) as QueryDataV3[];
		return groupSeverityCounts(toRows(result[0]));
	}, [data]);

	return { counts, isLoading };
}
