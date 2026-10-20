import QueryFunctions from 'container/QueryBuilder/components/QueryFunctions/QueryFunctions';
import { useQueryOperations } from 'hooks/queryBuilder/useQueryBuilderOperations';
import { IBuilderQuery } from 'types/api/queryBuilder/queryBuilderData';

/**
 * A query's functions, applied in order: the builder's own function editor
 * (the one behind its "fx" button) laid out as rows.
 */
function FunctionsSection({
	query,
	index,
}: {
	query: IBuilderQuery;
	index: number;
}): JSX.Element {
	const { handleQueryFunctionsUpdates } = useQueryOperations({
		index,
		query,
		entityVersion: 'v3',
	});

	return (
		<div
			className="qp-functions"
			data-testid={`query-functions-${query.queryName}`}
		>
			<QueryFunctions
				query={query}
				queryFunctions={query.functions || []}
				key={query.functions?.toString()}
				onChange={handleQueryFunctionsUpdates}
				maxFunctions={3}
			/>
		</div>
	);
}

export default FunctionsSection;
