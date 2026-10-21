import { useMemo } from 'react';
import { useQueryClient } from 'react-query';

import {
	cachedOptionsFromDynamicResponse,
	cachedOptionsFromQueryResponse,
} from '../utils/variableRowSummary';
import type { VariableFormModel } from '../variableFormModel';

function latestData(entries: [unknown, unknown][]): unknown {
	const loaded = entries.filter(([, data]) => data !== undefined);
	return loaded.length > 0 ? loaded[loaded.length - 1][1] : undefined;
}

/**
 * The QUERY/DYNAMIC options the variables bar has already fetched, read from the
 * react-query cache without requesting anything. Keyed by variable name.
 */
export function useCachedVariableOptions(
	variables: VariableFormModel[],
): Record<string, string[] | undefined> {
	const queryClient = useQueryClient();

	return useMemo(() => {
		const byName: Record<string, string[] | undefined> = {};
		variables.forEach((variable) => {
			if (variable.type === 'QUERY') {
				byName[variable.name] = cachedOptionsFromQueryResponse(
					latestData(
						queryClient.getQueriesData([
							'dashboard-variable',
							variable.name,
							variable.queryValue,
						]),
					),
					variable.sort,
				);
			} else if (variable.type === 'DYNAMIC' && variable.dynamicAttribute) {
				byName[variable.name] = cachedOptionsFromDynamicResponse(
					latestData(
						queryClient.getQueriesData([
							'dashboard-variable-dynamic',
							variable.name,
							variable.dynamicSignal,
							variable.dynamicAttribute,
						]),
					),
					variable.sort,
				);
			}
		});
		return byName;
	}, [queryClient, variables]);
}
