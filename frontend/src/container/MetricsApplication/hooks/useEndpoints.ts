import { useMemo } from 'react';
import { useQuery } from 'react-query';
// eslint-disable-next-line no-restricted-imports
import { useSelector } from 'react-redux';
import getTopOperations from 'api/metrics/getTopOperations';
import useResourceAttribute from 'hooks/useResourceAttribute';
import { Tags } from 'hooks/useResourceAttribute/types';
import { convertRawQueriesToTraceSelectedTags } from 'hooks/useResourceAttribute/utils';
import { endpointData } from 'lib/apm/endpointData';
import { EndpointRow } from 'lib/apm/endpoints';
import { endpointRequests, EndpointGroupBy } from 'lib/apm/serviceRequests';
import { useApmQueryRange } from 'lib/apm/useApmQueryRange';
import { useApmSource } from 'lib/apm/useApmSource';
import { useApmWindow } from 'lib/apm/useApmWindow';
import { useResourceFilterExpression } from 'lib/apm/useResourceFilterExpression';
import { AppState } from 'store/reducers';
import { PayloadProps } from 'types/api/metrics/getTopOperations';
import { GlobalReducer } from 'types/reducer/globalTime';

import { useServiceTopLevelOperations } from './useServiceTopLevelOperations';

interface EndpointsOptions {
	groupBy: EndpointGroupBy;
	entryPoint: boolean;
}

interface Endpoints {
	rows: EndpointRow[];
	/** The top operations as the API returned them, for the CSV download. */
	topOperations: PayloadProps;
	isLoading: boolean;
}

/**
 * The service's endpoints: top or entry-point operations (traces) or span
 * metrics by operation, plus the series behind rate, average and time share.
 */
export function useEndpoints(
	servicename: string,
	{ groupBy, entryPoint }: EndpointsOptions,
): Endpoints {
	const source = useApmSource();
	const window = useApmWindow();
	const resourceFilter = useResourceFilterExpression();
	const { maxTime, minTime } = useSelector<AppState, GlobalReducer>(
		(state) => state.globalTime,
	);
	const { queries } = useResourceAttribute();
	const selectedTags = useMemo(
		() => (convertRawQueriesToTraceSelectedTags(queries) as Tags[]) || [],
		[queries],
	);
	const { operations } = useServiceTopLevelOperations(servicename);
	const readsTopOperations = source === 'traces' && groupBy === 'name';

	const topOperations = useQuery<PayloadProps>({
		queryKey: [minTime, maxTime, servicename, selectedTags, entryPoint],
		queryFn: (): Promise<PayloadProps> =>
			getTopOperations({
				service: servicename || '',
				start: minTime,
				end: maxTime,
				selectedTags,
				isEntryPoint: entryPoint,
			}),
		enabled: readsTopOperations,
	});

	const requests = useMemo(
		() =>
			endpointRequests({
				source,
				window,
				servicename,
				resourceFilter,
				groupBy: source === 'span-metrics' ? 'name' : groupBy,
				entryPoint,
				topLevelOperations: operations,
			}),
		[
			source,
			window,
			servicename,
			resourceFilter,
			groupBy,
			entryPoint,
			operations,
		],
	);
	const series = useApmQueryRange(['service-endpoint-series'], requests.series);
	const totals = useApmQueryRange(['service-endpoint-totals'], requests.totals);

	const rows = useMemo(
		() =>
			endpointData(source, groupBy, window, {
				series: series.data,
				totals: totals.data,
				topOperations: topOperations.data,
			}),
		[source, groupBy, window, series.data, totals.data, topOperations.data],
	);

	const isLoading = readsTopOperations
		? topOperations.isLoading
		: totals.isLoading;
	return { rows, topOperations: topOperations.data ?? [], isLoading };
}
