import {
	describeRootCause,
	findRootCauses,
	RootCauseGraph,
} from '../utils/rootCause';

interface NodeSpec {
	errorRate?: number;
	rate?: number;
	p99?: number;
	inferred?: boolean;
}

function graph(
	nodes: Record<string, NodeSpec>,
	edges: [string, string, number?][],
): RootCauseGraph {
	return {
		nodes: Object.entries(nodes).map(([id, spec]) => ({
			id,
			errorRate: spec.errorRate ?? 0,
			rate: spec.rate ?? 1,
			p99: spec.p99,
			inferred: spec.inferred ?? false,
		})),
		edges: edges.map(([source, target, errorRate]) => ({
			source,
			target,
			errorRate: errorRate ?? 0,
			rate: 1,
		})),
	};
}

describe('findRootCauses', () => {
	it.each<{
		name: string;
		input: RootCauseGraph;
		expected: { service: string; path: string[]; failing?: string[] }[];
	}>([
		{
			name: 'no errors',
			input: graph({ a: {}, b: {}, c: {} }, [
				['a', 'b'],
				['b', 'c'],
			]),
			expected: [],
		},
		{
			name: 'errors below the threshold',
			input: graph({ a: { errorRate: 2 }, b: { errorRate: 4.9 } }, [
				['a', 'b', 4.9],
			]),
			expected: [],
		},
		{
			name:
				'a chain names its deepest failing service and the failing calls up to it',
			input: graph(
				{ a: { errorRate: 6 }, b: { errorRate: 7 }, c: { errorRate: 7 } },
				[
					['a', 'b', 7],
					['b', 'c', 7],
				],
			),
			expected: [{ service: 'c', path: ['a', 'b', 'c'] }],
		},
		{
			name: 'the path stops at the first call that does not fail',
			input: graph({ a: {}, b: {}, c: { errorRate: 18.5 } }, [
				['a', 'b', 0],
				['b', 'c', 18.5],
			]),
			expected: [{ service: 'c', path: ['b', 'c'] }],
		},
		{
			name: 'a failing service with healthy dependencies is the root',
			input: graph({ a: { errorRate: 30 }, b: {} }, [['a', 'b', 0]]),
			expected: [{ service: 'a', path: ['a'] }],
		},
		{
			name: 'fan-out with two failing branches gives two roots, worst first',
			input: graph({ a: {}, b: { errorRate: 10 }, c: { errorRate: 50 }, d: {} }, [
				['a', 'b', 10],
				['a', 'c', 50],
				['a', 'd'],
			]),
			expected: [
				{ service: 'c', path: ['a', 'c'] },
				{ service: 'b', path: ['a', 'b'] },
			],
		},
		{
			name: 'a failing cycle counts once, by its worst member',
			input: graph({ a: {}, b: { errorRate: 20 }, c: { errorRate: 40 } }, [
				['a', 'b', 20],
				['b', 'c', 40],
				['c', 'b', 20],
			]),
			expected: [{ service: 'c', path: ['a', 'b', 'c'] }],
		},
		{
			name: 'a cycle with a failing service below it defers to that service',
			input: graph(
				{ b: { errorRate: 20 }, c: { errorRate: 20 }, d: { errorRate: 60 } },
				[
					['b', 'c', 20],
					['c', 'b', 20],
					['c', 'd', 60],
				],
			),
			expected: [{ service: 'd', path: ['b', 'c', 'd'] }],
		},
		{
			name: 'multiple entry points, each with its own failing service',
			input: graph(
				{
					web: {},
					api: {},
					payment: { errorRate: 100, rate: 0.5 },
					redis: { errorRate: 18.5, rate: 5 },
				},
				[
					['web', 'redis', 18.5],
					['api', 'payment', 100],
				],
			),
			expected: [
				{ service: 'payment', path: ['api', 'payment'] },
				{ service: 'redis', path: ['web', 'redis'] },
			],
		},
		{
			name: 'an isolated failing service is its own root',
			input: graph({ payment: { errorRate: 100 } }, []),
			expected: [{ service: 'payment', path: ['payment'] }],
		},
		{
			name: 'dependencies without an SDK are never the root, but are named',
			input: graph(
				{
					payment: { errorRate: 100 },
					'1.2.3.4': { errorRate: 100, inferred: true },
					cache: { inferred: true },
				},
				[
					['payment', '1.2.3.4', 100],
					['payment', 'cache', 0],
				],
			),
			expected: [{ service: 'payment', path: ['payment'], failing: ['1.2.3.4'] }],
		},
		{
			name: 'a service without traffic is ignored',
			input: graph({ idle: { errorRate: 100, rate: 0 } }, []),
			expected: [],
		},
	])('$name', ({ input, expected }) => {
		expect(
			findRootCauses(input).map((cause) => ({
				service: cause.service,
				path: cause.path,
				...(cause.failingDependencies.length
					? { failing: cause.failingDependencies }
					: {}),
			})),
		).toStrictEqual(expected);
	});

	it('reports the root cause error rate and p99', () => {
		const [cause] = findRootCauses(
			graph({ payment: { errorRate: 100, p99: 500 } }, []),
		);
		expect(cause).toMatchObject({ errorRate: 100, p99: 500 });
	});
});

describe('describeRootCause', () => {
	it.each([
		{
			name: 'healthy dependencies',
			cause: {
				service: 'redis',
				errorRate: 18.5,
				p99: 40,
				path: ['driver', 'redis'],
				failingDependencies: [],
			},
			expected:
				'is the deepest unhealthy service: 18.5% errors and p99 40 ms. The services it calls are healthy, so it is the likely root cause.',
		},
		{
			name: 'failing dependencies without an SDK, no p99',
			cause: {
				service: 'payment',
				errorRate: 100,
				path: ['payment'],
				failingDependencies: ['1.2.3.4'],
			},
			expected:
				'is the deepest unhealthy service: 100% errors. Its calls to 1.2.3.4 fail too; with no SDK there, they are seen only through its client spans.',
		},
	])('$name', ({ cause, expected }) => {
		expect(describeRootCause(cause)).toBe(expected);
	});
});
