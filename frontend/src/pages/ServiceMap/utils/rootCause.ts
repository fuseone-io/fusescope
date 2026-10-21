import { ERROR_RATE_CRITICAL } from 'pages/Services/components/ServicesList/constants';

import { formatLatencyMs, formatPercent } from 'lib/apm/format';

import { RootCause } from '../types';

interface RootCauseNode {
	id: string;
	errorRate: number;
	rate: number;
	p99?: number;
	inferred: boolean;
}

interface RootCauseEdge {
	source: string;
	target: string;
	errorRate: number;
	rate: number;
}

export interface RootCauseGraph {
	nodes: RootCauseNode[];
	edges: RootCauseEdge[];
}

const failing = (errorRate: number): boolean =>
	errorRate >= ERROR_RATE_CRITICAL;

const worstFirst = (
	a: { errorRate: number; rate: number; id?: string },
	b: { errorRate: number; rate: number; id?: string },
): number =>
	b.errorRate - a.errorRate ||
	b.rate - a.rate ||
	(a.id ?? '').localeCompare(b.id ?? '');

/** Failing services reachable from `start` through failing services. */
function failingReach(
	start: string,
	callees: Map<string, string[]>,
	unhealthy: Set<string>,
): Set<string> {
	const seen = new Set<string>();
	const queue = [start];
	while (queue.length) {
		const current = queue.shift() as string;
		(callees.get(current) ?? []).forEach((next) => {
			if (unhealthy.has(next) && !seen.has(next)) {
				seen.add(next);
				queue.push(next);
			}
		});
	}
	return seen;
}

/** Callers whose calls fail, walked up from the root cause, outermost first. */
function failingPath(root: string, edges: RootCauseEdge[]): string[] {
	const path = [root];
	const visited = new Set(path);
	let current = root;
	for (;;) {
		const caller = edges
			.filter(
				(edge) =>
					edge.target === current &&
					failing(edge.errorRate) &&
					!visited.has(edge.source),
			)
			.sort(worstFirst)[0];
		if (!caller) {
			return path;
		}
		path.unshift(caller.source);
		visited.add(caller.source);
		current = caller.source;
	}
}

/**
 * The deepest failing services: an error rate at or above the critical
 * threshold while every service they call is healthy. Members of a failing
 * cycle count once, by the worst of them. Dependencies without an SDK are
 * only seen through their callers' client spans, so they are named with the
 * caller rather than blamed on their own.
 */
export function findRootCauses({ nodes, edges }: RootCauseGraph): RootCause[] {
	const services = nodes.filter((node) => !node.inferred);
	const byId = new Map(nodes.map((node) => [node.id, node]));
	const unhealthy = new Set(
		services
			.filter((node) => node.rate > 0 && failing(node.errorRate))
			.map((node) => node.id),
	);
	const callees = new Map<string, string[]>();
	edges
		.filter((edge) => edge.source !== edge.target)
		.forEach((edge) => {
			callees.set(edge.source, [...(callees.get(edge.source) ?? []), edge.target]);
		});

	const reach = new Map(
		Array.from(unhealthy).map((id) => [id, failingReach(id, callees, unhealthy)]),
	);
	const deepest = Array.from(unhealthy).filter((id) =>
		Array.from(reach.get(id) ?? []).every((other) => reach.get(other)?.has(id)),
	);
	const roots = deepest
		.map((id) => byId.get(id) as RootCauseNode)
		.sort(worstFirst)
		.filter((node, index, sorted) =>
			sorted.slice(0, index).every((worse) => !reach.get(worse.id)?.has(node.id)),
		);

	return roots.map((node) => ({
		service: node.id,
		errorRate: node.errorRate,
		p99: node.p99,
		path: failingPath(node.id, edges),
		failingDependencies: edges
			.filter(
				(edge) =>
					edge.source === node.id &&
					byId.get(edge.target)?.inferred &&
					failing(edge.errorRate),
			)
			.map((edge) => edge.target),
	}));
}

/** The sentence after the root cause's name in the banner. */
export function describeRootCause(cause: RootCause): string {
	const p99 =
		cause.p99 === undefined ? '' : ` and p99 ${formatLatencyMs(cause.p99)}`;
	const dependencies = cause.failingDependencies.length
		? ` Its calls to ${cause.failingDependencies.join(', ')} fail too; with no SDK there, they are seen only through its client spans.`
		: ' The services it calls are healthy, so it is the likely root cause.';
	return `is the deepest unhealthy service: ${formatPercent(cause.errorRate)} errors${p99}.${dependencies}`;
}
