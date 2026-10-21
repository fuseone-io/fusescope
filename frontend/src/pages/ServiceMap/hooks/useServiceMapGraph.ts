import { useMemo } from 'react';
import { useQuery } from 'react-query';
// eslint-disable-next-line no-restricted-imports
import { useSelector } from 'react-redux';
import api from 'api';
import getTopLevelOperations, {
	ServiceDataProps,
} from 'api/metrics/getTopLevelOperations';
import useResourceAttribute from 'hooks/useResourceAttribute';
import { serviceMapGraphKeys } from 'hooks/useResourceAttribute/config';
import {
	convertRawQueriesToTraceSelectedTags,
	filterServiceMapSupportedQueries,
} from 'hooks/useResourceAttribute/utils';
import { ServiceApm } from 'lib/apm/servicesList';
import { serviceSignals, serviceSignalsRequest } from 'lib/apm/serviceSignals';
import { useApmQueryRange } from 'lib/apm/useApmQueryRange';
import { useApmSource } from 'lib/apm/useApmSource';
import { useApmWindow } from 'lib/apm/useApmWindow';
import { useResourceFilterExpression } from 'lib/apm/useResourceFilterExpression';
import { useServicesApm } from 'pages/Services/components/ServicesList/useServicesApm';
import { AppState } from 'store/reducers';
import { GlobalReducer } from 'types/reducer/globalTime';

import { DependencyGraphItem, ServiceMapGraph } from '../types';
import { buildServiceGraph, scopeToServices } from '../utils/graph';
import { inferredCalls, inferredCallsRequest } from '../utils/requests';

export const DEPENDENCY_GRAPH_KEY = 'service-map-dependency-graph';

export type ServiceMapData =
	| { status: 'loading' }
	| { status: 'error'; error: unknown }
	| {
			status: 'success';
			graph: ServiceMapGraph;
			stats: Record<string, ServiceApm>;
			isFetching: boolean;
	  };

/**
 * The map's graph: `/dependency_graph` under the filters it supports, the
 * services' entry-span stats and type signals, and the calls it leaves out.
 * Filters the graph cannot apply (`service.namespace`) scope it to the
 * services they match.
 */
export function useServiceMapGraph(): ServiceMapData {
	const { minTime, maxTime } = useSelector<AppState, GlobalReducer>(
		(state) => state.globalTime,
	);
	const { queries } = useResourceAttribute();
	const tags = useMemo(
		() =>
			convertRawQueriesToTraceSelectedTags(
				filterServiceMapSupportedQueries(queries),
			),
		[queries],
	);
	const scoped = useMemo(
		() => queries.some((query) => !serviceMapGraphKeys.includes(query.tagKey)),
		[queries],
	);
	const window = useApmWindow();
	const resourceFilter = useResourceFilterExpression();
	const source = useApmSource();

	const dependencies = useQuery<DependencyGraphItem[]>({
		queryKey: [DEPENDENCY_GRAPH_KEY, minTime, maxTime, tags],
		queryFn: async () => {
			const response = await api.post<DependencyGraphItem[]>('/dependency_graph', {
				start: `${minTime}`,
				end: `${maxTime}`,
				tags,
			});
			return response.data ?? [];
		},
		keepPreviousData: true,
		refetchOnWindowFocus: false,
	});
	const topLevel = useQuery<ServiceDataProps>({
		queryKey: ['service-map-top-level-operations', minTime, maxTime],
		queryFn: () => getTopLevelOperations({ start: minTime, end: maxTime }),
		enabled: source === 'span-metrics',
	});
	const operations = useMemo(
		() => Object.entries(topLevel.data ?? {}),
		[topLevel.data],
	);
	const services = useServicesApm(source, operations);

	const signalsRequest = useMemo(
		() => serviceSignalsRequest(window, resourceFilter),
		[window, resourceFilter],
	);
	const signals = useApmQueryRange(['service-kinds'], signalsRequest);
	const inferredRequest = useMemo(
		() => inferredCallsRequest(window, resourceFilter),
		[window, resourceFilter],
	);
	const inferred = useApmQueryRange(['service-map-inferred'], inferredRequest);

	const graph = useMemo(() => {
		const current = Object.fromEntries(
			Object.entries(services.stats).map(([name, apm]) => [name, apm.current]),
		);
		const built = buildServiceGraph({
			dependencies: dependencies.data ?? [],
			services: current,
			signals: serviceSignals(signals.data),
			...inferredCalls(inferred.data),
			windowSeconds: window.seconds,
		});
		return scopeToServices(
			built,
			scoped ? new Set(Object.keys(services.stats)) : null,
		);
	}, [
		dependencies.data,
		services.stats,
		signals.data,
		inferred.data,
		window.seconds,
		scoped,
	]);

	if (dependencies.isError) {
		return { status: 'error', error: dependencies.error };
	}
	if (dependencies.isLoading || services.isLoading) {
		return { status: 'loading' };
	}
	return {
		status: 'success',
		graph,
		stats: services.stats,
		isFetching: dependencies.isFetching,
	};
}
