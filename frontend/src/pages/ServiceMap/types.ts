import { DeltaTextTone } from 'components/PageTemplate/components/DeltaText';
import { StatusTone } from 'components/PageTemplate/types';
import { ServiceKind } from 'lib/apm/serviceKind';
import { PeriodStats } from 'lib/apm/types';

/** The span attribute a node without its own spans was named after. */
export type InferredAttribute =
	| 'db.system'
	| 'messaging.system'
	| 'peer.service'
	| 'server.address';

export type Protocol = 'http' | 'grpc' | 'rpc' | 'db' | 'messaging';

export type NodeHealth = 'healthy' | 'degraded' | 'critical';

export type ColorMode = 'health' | 'latency' | 'throughput';

/** Rates per second, error rates 0–100, latencies in ms. */
export interface MapNode {
	id: string;
	/** Reports no spans of its own: known only from its callers' spans. */
	inferred: boolean;
	inferredFrom?: { attribute: InferredAttribute; value: string };
	kind: ServiceKind;
	language?: string;
	rate: number;
	errorRate: number;
	p50?: number;
	p95?: number;
	p99?: number;
}

export interface MapEdge {
	source: string;
	target: string;
	rate: number;
	errorRate: number;
	p50?: number;
	p95?: number;
	p99?: number;
	protocol?: Protocol;
}

export interface ServiceMapGraph {
	nodes: MapNode[];
	edges: MapEdge[];
}

/** One row of `POST /api/v1/dependency_graph`; latencies in ns. */
export interface DependencyGraphItem {
	parent: string;
	child: string;
	callCount?: number;
	callRate: number;
	errorRate: number;
	p50?: number;
	p95?: number;
	p99: number;
}

/** Client or producer spans of `caller` naming `peer` in `peer.service`. */
export interface PeerCall {
	caller: string;
	peer: string;
	requests: number;
	errors: number;
	/** ns */
	p50?: number;
	p95?: number;
	p99?: number;
}

/** Calls of `caller` to an address, from span metrics. */
export interface AddressCall {
	caller: string;
	address: string;
	rate: number;
	errorRate: number;
}

export interface GraphInput {
	dependencies: DependencyGraphItem[];
	/** Entry-span stats of every service that reports spans. */
	services: Record<string, PeriodStats>;
	/** Names that report spans of their own, with their type signals. */
	signals: Record<string, ServiceSignalsLike>;
	peers: PeerCall[];
	addresses: AddressCall[];
	/** `rpc.system` of each service's SERVER spans. */
	rpcSystems: Record<string, string>;
	dbSystems: string[];
	messagingSystems: string[];
	windowSeconds: number;
}

export interface ServiceSignalsLike {
	language?: string;
	dbSystem?: string;
	dbSpans?: number;
	messagingSpans?: number;
	rpcServerSpans?: number;
	httpServerSpans?: number;
	serverSpans?: number;
	databasePeer?: boolean;
}

export interface MapKpis {
	services: number;
	inferred: number;
	connections: number;
	protocols: Protocol[];
	ingressRate: number;
	ingressErrorRate: number;
	entryPoints: string[];
	failingConnections: number;
	unhealthy: string[];
}

export interface RootCause {
	service: string;
	errorRate: number;
	p99?: number;
	/** Callers whose calls fail, from the outermost to the root cause itself. */
	path: string[];
	/** Dependencies without an SDK the root cause calls, failing too. */
	failingDependencies: string[];
}

export interface NodePeriod {
	current?: PeriodStats;
	previous?: PeriodStats;
}

export type RingTone = StatusTone | 'primary';

export interface StatRow {
	name: string;
	rate: number;
	errorRate: number;
	p99?: number;
	tone?: RingTone;
}

export interface KpiTile {
	label: string;
	value: string;
	valueClassName?: string;
	delta?: { text: string; tone: DeltaTextTone; previous: string };
	spark?: number[];
	sparkClassName?: string;
}
