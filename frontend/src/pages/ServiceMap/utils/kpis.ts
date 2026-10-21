import { ERROR_RATE_CRITICAL } from 'pages/Services/components/ServicesList/constants';

import { MapEdge, MapKpis, ServiceMapGraph } from '../types';
import { nodeHealth } from './health';

/** The map's headline numbers; ingress is measured at the services nothing calls. */
export function mapKpis({ nodes, edges }: ServiceMapGraph): MapKpis {
	const calls = edges.filter((edge) => edge.source !== edge.target);
	const services = nodes.filter((node) => !node.inferred);
	const called = new Set(calls.map((edge) => edge.target));
	const entries = services.filter((node) => !called.has(node.id));
	const ingressRate = entries.reduce((sum, node) => sum + node.rate, 0);
	const failed = entries.reduce(
		(sum, node) => sum + node.rate * node.errorRate,
		0,
	);
	return {
		services: services.length,
		inferred: nodes.length - services.length,
		connections: calls.length,
		protocols: Array.from(
			new Set(calls.flatMap((edge) => (edge.protocol ? [edge.protocol] : []))),
		).sort(),
		ingressRate,
		ingressErrorRate: ingressRate > 0 ? failed / ingressRate : 0,
		entryPoints: entries.map((node) => node.id).sort(),
		failingConnections: calls.filter(
			(edge) => edge.errorRate >= ERROR_RATE_CRITICAL,
		).length,
		unhealthy: services
			.filter((node) => nodeHealth(node.errorRate, node.p99) === 'critical')
			.map((node) => node.id)
			.sort(),
	};
}

/** Every caller → callee pair, worst first: error rate, then p99, then traffic. */
export function worstDependencies(edges: MapEdge[]): MapEdge[] {
	return edges
		.filter((edge) => edge.source !== edge.target)
		.sort(
			(a, b) =>
				b.errorRate - a.errorRate ||
				(b.p99 ?? -1) - (a.p99 ?? -1) ||
				b.rate - a.rate,
		);
}
