import { useMemo } from 'react';
import { useQuery } from 'react-query';
// eslint-disable-next-line no-restricted-imports
import { useSelector } from 'react-redux';
import getTopOperations from 'api/metrics/getTopOperations';
import { useServiceKpis } from 'container/MetricsApplication/hooks/useServiceKpis';
import useResourceAttribute from 'hooks/useResourceAttribute';
import { Tags } from 'hooks/useResourceAttribute/types';
import { convertRawQueriesToTraceSelectedTags } from 'hooks/useResourceAttribute/utils';
import { useApmQueryRange } from 'lib/apm/useApmQueryRange';
import { useApmWindow } from 'lib/apm/useApmWindow';
import { useResourceFilterExpression } from 'lib/apm/useResourceFilterExpression';
import { AppState } from 'store/reducers';
import { PayloadProps } from 'types/api/metrics/getTopOperations';
import { GlobalReducer } from 'types/reducer/globalTime';

import { PANEL_ROWS } from '../constants';
import { NodePeriod } from '../types';
import {
	NodeDetails,
	nodeDetails,
	nodeDetailsRequest,
} from '../utils/requests';

interface ServiceDetails extends NodePeriod {
	details: NodeDetails;
	operations: PayloadProps;
	isLoading: boolean;
}

/**
 * The selected service's KPIs with the previous period, SERVER percentiles,
 * resource attributes and busiest operations, from the Services pages' APIs.
 */
export function useServiceDetails(servicename: string): ServiceDetails {
	const { minTime, maxTime } = useSelector<AppState, GlobalReducer>(
		(state) => state.globalTime,
	);
	const { queries } = useResourceAttribute();
	const selectedTags = useMemo(
		() => (convertRawQueriesToTraceSelectedTags(queries) as Tags[]) || [],
		[queries],
	);
	const window = useApmWindow();
	const resourceFilter = useResourceFilterExpression();
	const kpis = useServiceKpis(servicename);
	const request = useMemo(
		() => nodeDetailsRequest(window, servicename, resourceFilter),
		[window, servicename, resourceFilter],
	);
	const detailsQuery = useApmQueryRange(['service-map-node-details'], request);
	const operations = useQuery<PayloadProps>({
		queryKey: [
			'service-map-top-operations',
			minTime,
			maxTime,
			servicename,
			selectedTags,
		],
		queryFn: () =>
			getTopOperations({
				service: servicename,
				start: minTime,
				end: maxTime,
				selectedTags,
			}),
		refetchOnWindowFocus: false,
	});

	const details = useMemo(
		() => nodeDetails(detailsQuery.data),
		[detailsQuery.data],
	);
	const top = useMemo(
		() =>
			[...(operations.data ?? [])]
				.sort((a, b) => b.numCalls - a.numCalls)
				.slice(0, PANEL_ROWS),
		[operations.data],
	);
	return {
		current: kpis.current,
		previous: kpis.previous,
		details,
		operations: top,
		isLoading: kpis.isLoading || detailsQuery.isLoading,
	};
}
