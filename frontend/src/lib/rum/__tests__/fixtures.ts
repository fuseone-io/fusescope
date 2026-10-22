/** A scalar query result in the v5 response shape. */
export function scalarResult(
	queryName: string,
	groups: string[],
	aggregations: number,
	data: unknown[][],
): unknown {
	return {
		queryName,
		columns: [
			...groups.map((name) => ({ name, queryName, columnType: 'group' })),
			...Array.from({ length: aggregations }, (_, index) => ({
				name: `__result_${index}`,
				queryName,
				aggregationIndex: index,
				columnType: 'aggregation',
			})),
		],
		data,
	};
}
