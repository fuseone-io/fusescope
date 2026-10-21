import { isHostlessAddress } from 'lib/apm/dependencies';
import { getServiceKind, ServiceKindName } from 'lib/apm/serviceKind';
import { NS_PER_MS } from 'lib/apm/spanMetrics';

import {
	GraphInput,
	InferredAttribute,
	MapEdge,
	MapNode,
	Protocol,
	ServiceMapGraph,
	ServiceSignalsLike,
} from '../types';

const QUEUE_NAME = /kafka|rabbit|sqs|nats|pulsar/i;
const DEPENDENCY_KINDS: ServiceKindName[] = [
	'database',
	'cache',
	'queue',
	'external',
];

const toMs = (ns: number | undefined): number | undefined =>
	ns === undefined || !Number.isFinite(ns) ? undefined : ns / NS_PER_MS;

/** A host, optionally with a port: not an operation name or a URL path. */
const isHost = (address: string): boolean =>
	!isHostlessAddress(address) && !/[\s/]/.test(address);

const hostOf = (address: string): string => address.replace(/:\d+$/, '');

interface Inference {
	attribute: InferredAttribute;
	value: string;
}

function dependencyEdges(
	input: GraphInput,
	traced: Set<string>,
	inferred: Map<string, Inference>,
): MapEdge[] {
	const edges: MapEdge[] = [];
	const has = (source: string, target: string): boolean =>
		edges.some((edge) => edge.source === source && edge.target === target);

	input.dependencies.forEach((item) => {
		if (item.parent === item.child) {
			return;
		}
		edges.push({
			source: item.parent,
			target: item.child,
			rate: item.callRate,
			errorRate: item.errorRate,
			p50: toMs(item.p50),
			p95: toMs(item.p95),
			p99: toMs(item.p99),
		});
		if (!traced.has(item.child) && !inferred.has(item.child)) {
			const messaging =
				input.messagingSystems.includes(item.child) ||
				(!input.dbSystems.includes(item.child) && QUEUE_NAME.test(item.child));
			inferred.set(item.child, {
				attribute: messaging ? 'messaging.system' : 'db.system',
				value: item.child,
			});
		}
	});

	input.peers.forEach((peer) => {
		if (
			peer.caller === peer.peer ||
			traced.has(peer.peer) ||
			has(peer.caller, peer.peer)
		) {
			return;
		}
		edges.push({
			source: peer.caller,
			target: peer.peer,
			rate: peer.requests / input.windowSeconds,
			errorRate: peer.requests > 0 ? (peer.errors / peer.requests) * 100 : 0,
			p50: toMs(peer.p50),
			p95: toMs(peer.p95),
			p99: toMs(peer.p99),
		});
		if (!inferred.has(peer.peer)) {
			inferred.set(peer.peer, { attribute: 'peer.service', value: peer.peer });
		}
	});

	input.addresses.forEach((call) => {
		const host = hostOf(call.address);
		if (
			!isHost(call.address) ||
			traced.has(host) ||
			traced.has(call.address) ||
			has(call.caller, call.address)
		) {
			return;
		}
		edges.push({
			source: call.caller,
			target: call.address,
			rate: call.rate,
			errorRate: call.errorRate,
		});
		if (!inferred.has(call.address)) {
			inferred.set(call.address, {
				attribute: 'server.address',
				value: call.address,
			});
		}
	});
	return edges;
}

/** Totals of the calls into a node that reports nothing itself. */
function fromCallers(
	id: string,
	edges: MapEdge[],
): Pick<MapNode, 'rate' | 'errorRate' | 'p50' | 'p95' | 'p99'> {
	const calls = edges.filter((edge) => edge.target === id);
	const rate = calls.reduce((sum, edge) => sum + edge.rate, 0);
	const failed = calls.reduce(
		(sum, edge) => sum + edge.rate * edge.errorRate,
		0,
	);
	const max = (key: 'p50' | 'p95' | 'p99'): number | undefined => {
		const values = calls
			.map((edge) => edge[key])
			.filter((value): value is number => value !== undefined);
		return values.length ? Math.max(...values) : undefined;
	};
	return {
		rate,
		errorRate: rate > 0 ? Math.round((failed / rate) * 1e6) / 1e6 : 0,
		p50: max('p50'),
		p95: max('p95'),
		p99: max('p99'),
	};
}

function nodeOf(
	id: string,
	input: GraphInput,
	edges: MapEdge[],
	inference: Inference | undefined,
): MapNode {
	const signals: ServiceSignalsLike = input.signals[id] ?? {};
	const own = input.services[id];
	const stats = own
		? {
				rate: own.rate,
				errorRate: own.errorRate,
				p50: own.p50,
				p95: own.p95,
				p99: own.p99,
			}
		: fromCallers(id, edges);
	const kind = getServiceKind({
		...signals,
		name: id,
		dbSystem: inference?.attribute === 'db.system' ? id : signals.dbSystem,
		messagingSpans:
			inference?.attribute === 'messaging.system' ? 1 : signals.messagingSpans,
		externalOnly:
			inference?.attribute === 'peer.service' ||
			inference?.attribute === 'server.address',
	});
	return {
		id,
		inferred: inference !== undefined,
		inferredFrom: inference,
		kind,
		language: signals.language,
		...stats,
	};
}

function protocolOf(target: MapNode, input: GraphInput): Protocol | undefined {
	const attribute = target.inferredFrom?.attribute;
	if (
		attribute === 'db.system' ||
		['database', 'cache'].includes(target.kind.kind)
	) {
		return 'db';
	}
	if (attribute === 'messaging.system' || target.kind.kind === 'queue') {
		return 'messaging';
	}
	if (target.inferred) {
		return undefined;
	}
	const signals = input.signals[target.id] ?? {};
	const rpc = signals.rpcServerSpans ?? 0;
	const http = signals.httpServerSpans ?? 0;
	const rpcSystem = input.rpcSystems[target.id];
	if ((rpcSystem || rpc > 0) && rpc >= http) {
		return rpcSystem === 'grpc' ? 'grpc' : 'rpc';
	}
	return http > 0 ? 'http' : undefined;
}

/**
 * Nodes and edges from the dependency graph, plus the peers and addresses
 * services call without a span of their own: `peer.service` on client spans
 * and external addresses from span metrics.
 */
export function buildServiceGraph(input: GraphInput): ServiceMapGraph {
	const traced = new Set([
		...Object.keys(input.signals),
		...Object.keys(input.services),
	]);
	const inferred = new Map<string, Inference>();
	const edges = dependencyEdges(input, traced, inferred);
	const ids = Array.from(
		new Set([
			...Object.keys(input.services),
			...edges.flatMap((edge) => [edge.source, edge.target]),
		]),
	);
	const nodes = ids.map((id) => nodeOf(id, input, edges, inferred.get(id)));
	const byId = new Map(nodes.map((node) => [node.id, node]));
	return {
		nodes,
		edges: edges.map((edge) => ({
			...edge,
			protocol: protocolOf(byId.get(edge.target) as MapNode, input),
		})),
	};
}

export const isDependency = (node: MapNode): boolean =>
	node.inferred || DEPENDENCY_KINDS.includes(node.kind.kind);

/** Without databases, caches, queues and externals when they are switched off. */
export function visibleGraph(
	graph: ServiceMapGraph,
	showDependencies: boolean,
): ServiceMapGraph {
	if (showDependencies) {
		return graph;
	}
	const hidden = new Set(
		graph.nodes.filter(isDependency).map((node) => node.id),
	);
	return {
		nodes: graph.nodes.filter((node) => !hidden.has(node.id)),
		edges: graph.edges.filter(
			(edge) => !hidden.has(edge.source) && !hidden.has(edge.target),
		),
	};
}

/**
 * Only the services a filter the dependency graph cannot apply keeps (such as
 * `service.namespace`), with their callers and callees.
 */
export function scopeToServices(
	graph: ServiceMapGraph,
	scope: Set<string> | null,
): ServiceMapGraph {
	if (!scope) {
		return graph;
	}
	const edges = graph.edges.filter(
		(edge) => scope.has(edge.source) || scope.has(edge.target),
	);
	const kept = new Set([
		...Array.from(scope),
		...edges.flatMap((edge) => [edge.source, edge.target]),
	]);
	return { nodes: graph.nodes.filter((node) => kept.has(node.id)), edges };
}

/** The node and everything it calls or is called by. */
export function neighbourhood(id: string, edges: MapEdge[]): Set<string> {
	return new Set([
		id,
		...edges.flatMap((edge) => {
			if (edge.source === id) {
				return [edge.target];
			}
			return edge.target === id ? [edge.source] : [];
		}),
	]);
}

/** Consecutive pairs of a path, as `source>target` keys. */
export const pathEdges = (path: string[]): Set<string> =>
	new Set(path.slice(1).map((id, index) => `${path[index]}>${id}`));
