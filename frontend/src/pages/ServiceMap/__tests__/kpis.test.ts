import { SERVICE_KIND_STUB } from './fixtures';
import { mapKpis, worstDependencies } from '../utils/kpis';
import { MapEdge, MapNode, ServiceMapGraph } from '../types';

const node = (id: string, spec: Partial<MapNode> = {}): MapNode => ({
	id,
	inferred: false,
	kind: SERVICE_KIND_STUB,
	rate: 1,
	errorRate: 0,
	...spec,
});

const edge = (
	source: string,
	target: string,
	spec: Partial<MapEdge> = {},
): MapEdge => ({ source, target, rate: 1, errorRate: 0, ...spec });

describe('mapKpis', () => {
	const graph: ServiceMapGraph = {
		nodes: [
			node('frontend', { rate: 4, errorRate: 0 }),
			node('driver'),
			node('redis', { errorRate: 18.5 }),
			node('payment', { rate: 1, errorRate: 100 }),
			node('1.2.3.4', { inferred: true }),
		],
		edges: [
			edge('frontend', 'driver', { protocol: 'grpc' }),
			edge('driver', 'redis', { errorRate: 18.5, protocol: 'db' }),
			edge('payment', '1.2.3.4', { errorRate: 100 }),
			edge('frontend', 'frontend'),
		],
	};

	it('counts services, inferred dependencies and connections', () => {
		expect(mapKpis(graph)).toMatchObject({
			services: 4,
			inferred: 1,
			connections: 3,
			protocols: ['db', 'grpc'],
			failingConnections: 2,
			unhealthy: ['payment', 'redis'],
		});
	});

	it('measures ingress at the entry points', () => {
		const kpis = mapKpis(graph);
		expect(kpis.entryPoints).toStrictEqual(['frontend', 'payment']);
		expect(kpis.ingressRate).toBe(5);
		expect(kpis.ingressErrorRate).toBe(20);
	});

	it('is all zero for an empty map', () => {
		expect(mapKpis({ nodes: [], edges: [] })).toMatchObject({
			services: 0,
			connections: 0,
			ingressRate: 0,
			ingressErrorRate: 0,
		});
	});
});

describe('worstDependencies', () => {
	it('sorts by error rate, then p99, then traffic', () => {
		const rows = worstDependencies([
			edge('a', 'b', { errorRate: 0, p99: 10 }),
			edge('a', 'c', { errorRate: 5, p99: 10 }),
			edge('a', 'd', { errorRate: 0, p99: 900 }),
			edge('a', 'e', { errorRate: 0 }),
			edge('a', 'f', { errorRate: 5, p99: 20 }),
			edge('a', 'a'),
		]);
		expect(rows.map((row) => row.target)).toStrictEqual([
			'f',
			'c',
			'd',
			'b',
			'e',
		]);
	});
});
