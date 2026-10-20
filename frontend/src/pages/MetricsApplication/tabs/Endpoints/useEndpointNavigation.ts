import { useOperationTraceNavigation } from 'container/MetricsApplication/KeyOperations/useOperationTraceNavigation';
import { useSafeNavigate } from 'hooks/useSafeNavigate';
import { EndpointRow } from 'lib/apm/endpoints';
import { EndpointGroupBy } from 'lib/apm/serviceRequests';
import { DataTypes } from 'types/api/queryBuilder/queryAutocompleteResponse';
import { TagFilterItem } from 'types/api/queryBuilder/queryBuilderData';

import { traceFilter, useTracesLink } from '../../hooks/useTracesLink';

function attributeFilter(
	groupBy: EndpointGroupBy,
	row: EndpointRow,
): TagFilterItem {
	if (!row.notSet) {
		return traceFilter(groupBy, [row.name]);
	}
	return {
		id: `${groupBy}-not-set`,
		key: {
			key: groupBy,
			dataType: DataTypes.String,
			type: 'tag',
			id: `${groupBy}--string--tag--true`,
		},
		op: 'nexists',
		value: '',
	};
}

/** Opens the traces of a row: by span name, or by the grouped attribute. */
export function useEndpointNavigation(
	servicename: string,
	groupBy: EndpointGroupBy,
): (row: EndpointRow, openInNewTab: boolean) => void {
	const openOperation = useOperationTraceNavigation(servicename);
	const tracesLink = useTracesLink(servicename);
	const { safeNavigate } = useSafeNavigate();

	return (row, openInNewTab): void => {
		if (groupBy === 'name') {
			openOperation(row.name, openInNewTab);
			return;
		}
		safeNavigate(tracesLink([attributeFilter(groupBy, row)]), {
			newTab: openInNewTab,
		});
	};
}
