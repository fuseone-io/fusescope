import { QueryDataV3 } from 'types/api/widgets/getQuery';

/** The matched-logs count of a count query, as a table or a series answers it. */
export function countFromResult(
	result: QueryDataV3 | undefined,
): number | string | undefined {
	const valueColumn = result?.table?.columns.find(
		(column) => column.isValueColumn,
	);
	if (valueColumn) {
		return result?.table?.rows?.[0]?.data?.[valueColumn.id ?? valueColumn.name];
	}
	return result?.series?.[0]?.values?.[0]?.value;
}
