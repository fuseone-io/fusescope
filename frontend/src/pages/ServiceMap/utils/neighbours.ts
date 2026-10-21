import { NS_PER_MS } from 'lib/apm/spanMetrics';
import { TopOperationList } from 'container/MetricsApplication/KeyOperations/types';

import { MapEdge, MapNode, StatRow } from '../types';
import { ringTone } from './health';

const worstFirst = (a: StatRow, b: StatRow): number =>
	b.errorRate - a.errorRate || b.rate - a.rate;

/** Who calls the node and what it calls, each with the call's numbers. */
export function neighbourRows(
	id: string,
	nodes: MapNode[],
	edges: MapEdge[],
): { callers: StatRow[]; calls: StatRow[] } {
	const byId = new Map(nodes.map((node) => [node.id, node]));
	const row = (edge: MapEdge, other: string): StatRow => {
		const node = byId.get(other);
		return {
			name: other,
			rate: edge.rate,
			errorRate: edge.errorRate,
			p99: edge.p99,
			tone: node ? ringTone(node, 'health') : undefined,
		};
	};
	return {
		callers: edges
			.filter((edge) => edge.target === id && edge.source !== id)
			.map((edge) => row(edge, edge.source))
			.sort(worstFirst),
		calls: edges
			.filter((edge) => edge.source === id && edge.target !== id)
			.map((edge) => row(edge, edge.target))
			.sort(worstFirst),
	};
}

/** Top operations as rows; their p99 comes in ns. */
export function operationRows(
	operations: TopOperationList[],
	seconds: number,
): StatRow[] {
	return operations.map((operation) => ({
		name: operation.name,
		rate: seconds > 0 ? operation.numCalls / seconds : 0,
		errorRate:
			operation.numCalls > 0
				? (operation.errorCount / operation.numCalls) * 100
				: 0,
		p99: operation.p99 / NS_PER_MS,
	}));
}
