import { initialQueriesMap } from 'constants/queryBuilder';
import { BaseAutocompleteData } from 'types/api/queryBuilder/queryAutocompleteResponse';
import { Query } from 'types/api/queryBuilder/queryBuilderData';
import { DataSource } from 'types/common/queryBuilder';

/** The query the list starts from: traces, filter only. */
export const DOMAINS_DEFAULT_QUERY: Query = {
	...initialQueriesMap.traces,
	builder: {
		...initialQueriesMap.traces.builder,
		queryData: [
			{
				...initialQueriesMap.traces.builder.queryData[0],
				dataSource: DataSource.TRACES,
				aggregateOperator: 'noop',
				aggregateAttribute: {
					...(initialQueriesMap.traces.builder.queryData[0]
						.aggregateAttribute as BaseAutocompleteData),
				},
			},
		],
	},
};
