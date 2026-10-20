import { NS_PER_MS } from './spanMetrics';

export interface GraphEdge {
	parent: string;
	child: string;
	callRate: number;
	errorRate: number;
	p50?: number;
	p99: number;
}

export interface ExternalAddress {
	address: string;
	rate: number;
	errorRate: number;
	/** Average call duration, ms. */
	avg: number;
}

export type DependencyKind = 'Service' | 'Database' | 'External';

export interface Dependency {
	name: string;
	kind: DependencyKind;
	rate: number;
	/** ms; unknown for external addresses, which report no percentiles. */
	p50?: number;
	p99?: number;
	errorRate: number;
}

interface DependencyInput {
	servicename: string;
	edges: GraphEdge[];
	/** Peers reached through spans that carry database attributes. */
	databases: string[];
	externals: ExternalAddress[];
}

/** Empty, unspecified (0.0.0.0) or colon-terminated: no usable host. */
export function isHostlessAddress(address: string): boolean {
	return /^(0[.]0[.]0[.]0)?(:[0-9]*)?$|:$/.test(address);
}

const byErrorsThenRate = (a: Dependency, b: Dependency): number =>
	b.errorRate - a.errorRate || b.rate - a.rate;

function fromEdge(
	name: string,
	edge: GraphEdge,
	databases: Set<string>,
): Dependency {
	return {
		name,
		kind: databases.has(name) ? 'Database' : 'Service',
		rate: edge.callRate,
		p50: edge.p50 === undefined ? undefined : edge.p50 / NS_PER_MS,
		p99: edge.p99 / NS_PER_MS,
		errorRate: edge.errorRate,
	};
}

/**
 * Callers and callees of the service from the dependency graph, with the
 * external addresses it calls that are not traced services themselves.
 */
export function serviceDependencies({
	servicename,
	edges,
	databases,
	externals,
}: DependencyInput): { upstream: Dependency[]; downstream: Dependency[] } {
	const databaseNames = new Set(databases);
	const upstream = edges
		.filter((edge) => edge.child === servicename && edge.parent !== servicename)
		.map((edge) => fromEdge(edge.parent, edge, databaseNames));
	const callees = edges
		.filter((edge) => edge.parent === servicename && edge.child !== servicename)
		.map((edge) => fromEdge(edge.child, edge, databaseNames));
	const traced = new Set([
		servicename,
		...edges.flatMap((edge) => [edge.parent, edge.child]),
	]);
	const external = externals
		.filter(
			(item) => !isHostlessAddress(item.address) && !traced.has(item.address),
		)
		.map(
			(item): Dependency => ({
				name: item.address,
				kind: 'External',
				rate: item.rate,
				p50: undefined,
				p99: undefined,
				errorRate: item.errorRate,
			}),
		);
	return {
		upstream: upstream.sort(byErrorsThenRate),
		downstream: [...callees, ...external].sort(byErrorsThenRate),
	};
}
