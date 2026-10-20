import { useMemo } from 'react';
import { useQuery } from 'react-query';
// eslint-disable-next-line no-restricted-imports
import { useSelector } from 'react-redux';
import api from 'api';
import useResourceAttribute from 'hooks/useResourceAttribute';
import { convertRawQueriesToTraceSelectedTags } from 'hooks/useResourceAttribute/utils';
import {
	Dependency,
	ExternalAddress,
	GraphEdge,
	serviceDependencies,
} from 'lib/apm/dependencies';
import { scalarRows } from 'lib/apm/queryRange';
import {
	databasePeersRequest,
	externalsRequest,
} from 'lib/apm/serviceRequests';
import { useApmQueryRange } from 'lib/apm/useApmQueryRange';
import { useApmWindow } from 'lib/apm/useApmWindow';
import { useResourceFilterExpression } from 'lib/apm/useResourceFilterExpression';
import { AppState } from 'store/reducers';
import { GlobalReducer } from 'types/reducer/globalTime';

interface ServiceDependencies {
	upstream: Dependency[];
	downstream: Dependency[];
	isLoading: boolean;
}

const finite = (value: number | undefined): number =>
	value !== undefined && Number.isFinite(value) ? value : 0;

/**
 * Callers and callees from the dependency graph (the Service Map's API), with
 * database peers and external addresses from span metrics.
 */
export function useServiceDependencies(
	servicename: string,
): ServiceDependencies {
	const { minTime, maxTime } = useSelector<AppState, GlobalReducer>(
		(state) => state.globalTime,
	);
	const { queries } = useResourceAttribute();
	const tags = useMemo(
		() => convertRawQueriesToTraceSelectedTags(queries),
		[queries],
	);
	const window = useApmWindow();
	const resourceFilter = useResourceFilterExpression();
	const requests = useMemo(() => {
		const scope = { window, servicename, resourceFilter };
		return {
			peers: databasePeersRequest(scope),
			externals: externalsRequest(scope),
		};
	}, [window, servicename, resourceFilter]);

	const graph = useQuery<GraphEdge[]>({
		queryKey: ['service-dependency-graph', minTime, maxTime, tags],
		queryFn: async () => {
			const response = await api.post<GraphEdge[]>('/dependency_graph', {
				start: `${minTime}`,
				end: `${maxTime}`,
				tags,
			});
			return response.data ?? [];
		},
		keepPreviousData: true,
	});
	const peers = useApmQueryRange(['service-database-peers'], requests.peers);
	const externals = useApmQueryRange(['service-externals'], requests.externals);

	return useMemo(() => {
		const failed = new Map(
			scalarRows(externals.data, 'B').map((row) => [
				row.labels.address,
				finite(row.values[0]),
			]),
		);
		const durations = new Map(
			scalarRows(externals.data, 'C').map((row) => [
				row.labels.address,
				finite(row.values[0]),
			]),
		);
		const addresses: ExternalAddress[] = scalarRows(externals.data, 'A').map(
			(row) => {
				const rate = finite(row.values[0]);
				return {
					address: row.labels.address,
					rate,
					errorRate:
						rate > 0 ? ((failed.get(row.labels.address) ?? 0) / rate) * 100 : 0,
					avg: rate > 0 ? (durations.get(row.labels.address) ?? 0) / rate : 0,
				};
			},
		);
		const { upstream, downstream } = serviceDependencies({
			servicename,
			edges: graph.data ?? [],
			databases: scalarRows(peers.data, 'A').map(
				(row) => row.labels['peer.service'],
			),
			externals: addresses,
		});
		return { upstream, downstream, isLoading: graph.isLoading };
	}, [graph.data, graph.isLoading, peers.data, externals.data, servicename]);
}
