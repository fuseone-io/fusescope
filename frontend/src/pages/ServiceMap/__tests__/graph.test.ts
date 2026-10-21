import { PeriodStats } from 'lib/apm/types';

import { GraphInput } from '../types';
import {
	buildServiceGraph,
	neighbourhood,
	pathEdges,
	scopeToServices,
	visibleGraph,
} from '../utils/graph';

const stats = (rate: number, errorRate: number, p99 = 10): PeriodStats => ({
	requests: rate * 60,
	rate,
	errorRate,
	p99,
});

const MS = 1e6;

/** HotROD plus a synthetic failing payment service. */
const hotrod: GraphInput = {
	dependencies: [
		{
			parent: 'frontend',
			child: 'customer',
			callRate: 0.37,
			errorRate: 0,
			p50: 300 * MS,
			p95: 350 * MS,
			p99: 370 * MS,
		},
		{
			parent: 'customer',
			child: 'mysql',
			callRate: 0.37,
			errorRate: 0,
			p99: 372 * MS,
		},
		{
			parent: 'frontend',
			child: 'driver',
			callRate: 0.37,
			errorRate: 0,
			p99: 200 * MS,
		},
		{
			parent: 'driver',
			child: 'redis-manual',
			callRate: 4.9,
			errorRate: 18.5,
			p99: 40 * MS,
		},
		{
			parent: 'frontend',
			child: 'route',
			callRate: 3.7,
			errorRate: 0,
			p99: 90 * MS,
		},
	],
	services: {
		frontend: stats(0.37, 0, 900),
		customer: stats(0.37, 0, 380),
		driver: stats(0.37, 0, 210),
		route: stats(3.7, 0, 90),
		mysql: stats(0.37, 0, 372),
		'redis-manual': stats(4.9, 18.5, 40),
		payment: stats(0.33, 100, 500),
	},
	signals: {
		frontend: { language: 'go', httpServerSpans: 10, serverSpans: 10 },
		customer: { language: 'go', httpServerSpans: 10, serverSpans: 10 },
		driver: { language: 'go', rpcServerSpans: 10, serverSpans: 10 },
		route: { language: 'go', httpServerSpans: 10, serverSpans: 10 },
		mysql: { language: 'go', databasePeer: true },
		'redis-manual': { language: 'go' },
		payment: { serverSpans: 10 },
	},
	peers: [
		{ caller: 'mysql', peer: 'mysql', requests: 1332, errors: 0, p99: 372 * MS },
		{
			caller: 'payment',
			peer: 'telemetrygen-server',
			requests: 600,
			errors: 600,
			p50: 500 * MS,
			p95: 500 * MS,
			p99: 500 * MS,
		},
	],
	addresses: [
		{
			caller: 'frontend',
			address: 'driver.DriverService/FindNearest',
			rate: 0.37,
			errorRate: 0,
		},
		{ caller: 'frontend', address: '0.0.0.0:', rate: 1, errorRate: 0 },
		{ caller: 'mysql', address: 'mysql', rate: 0.37, errorRate: 0 },
		{ caller: 'payment', address: '1.2.3.4', rate: 0.17, errorRate: 100 },
		{ caller: 'route', address: 'customer:8081', rate: 0.1, errorRate: 0 },
	],
	rpcSystems: { driver: 'grpc' },
	dbSystems: [],
	messagingSystems: [],
	windowSeconds: 3600,
};

const ids = (input: GraphInput): string[] =>
	buildServiceGraph(input)
		.nodes.map((node) => node.id)
		.sort();

describe('buildServiceGraph', () => {
	it('has every service, every dependency and the inferred peers', () => {
		expect(ids(hotrod)).toStrictEqual([
			'1.2.3.4',
			'customer',
			'driver',
			'frontend',
			'mysql',
			'payment',
			'redis-manual',
			'route',
			'telemetrygen-server',
		]);
	});

	it.each<[string, string]>([
		['hostless addresses', '0.0.0.0:'],
		[
			'addresses naming an operation, not a host',
			'driver.DriverService/FindNearest',
		],
		['addresses of a traced service', 'customer:8081'],
	])('drops %s', (_, address) => {
		expect(ids(hotrod)).not.toContain(address);
	});

	it('marks only nodes without spans of their own as inferred', () => {
		const graph = buildServiceGraph(hotrod);
		const inferred = Object.fromEntries(
			graph.nodes.map((node) => [node.id, node.inferredFrom ?? node.inferred]),
		);
		expect(inferred).toMatchObject({
			frontend: false,
			mysql: false,
			'redis-manual': false,
			payment: false,
			'1.2.3.4': { attribute: 'server.address', value: '1.2.3.4' },
			'telemetrygen-server': {
				attribute: 'peer.service',
				value: 'telemetrygen-server',
			},
		});
	});

	it('keeps a service own stats and gives inferred nodes their callers', () => {
		const nodes = Object.fromEntries(
			buildServiceGraph(hotrod).nodes.map((node) => [node.id, node]),
		);
		expect(nodes['redis-manual']).toMatchObject({ rate: 4.9, errorRate: 18.5 });
		expect(nodes['telemetrygen-server']).toMatchObject({
			errorRate: 100,
			p99: 500,
		});
		expect(nodes['telemetrygen-server'].rate).toBeCloseTo(600 / 3600);
		expect(nodes['1.2.3.4']).toMatchObject({ rate: 0.17, errorRate: 100 });
	});

	it('converts edge latencies to ms and sets protocols', () => {
		const edges = Object.fromEntries(
			buildServiceGraph(hotrod).edges.map((edge) => [
				`${edge.source}>${edge.target}`,
				edge,
			]),
		);
		expect(edges['frontend>customer']).toMatchObject({
			p50: 300,
			p95: 350,
			p99: 370,
			protocol: 'http',
		});
		expect(edges['frontend>driver'].protocol).toBe('grpc');
		expect(edges['customer>mysql'].protocol).toBe('db');
		expect(edges['driver>redis-manual'].protocol).toBe('db');
		expect(edges['payment>1.2.3.4'].protocol).toBeUndefined();
		expect(edges['mysql>mysql']).toBeUndefined();
	});

	it('names db.system and messaging.system targets after the attribute', () => {
		const graph = buildServiceGraph({
			...hotrod,
			dependencies: [
				{
					parent: 'checkout',
					child: 'postgresql',
					callRate: 1,
					errorRate: 0,
					p99: MS,
				},
				{ parent: 'checkout', child: 'kafka', callRate: 1, errorRate: 0, p99: MS },
			],
			services: { checkout: stats(1, 0) },
			signals: { checkout: { serverSpans: 1 } },
			peers: [],
			addresses: [],
			dbSystems: ['postgresql'],
			messagingSystems: ['kafka'],
		});
		const nodes = Object.fromEntries(graph.nodes.map((node) => [node.id, node]));
		expect(nodes.postgresql).toMatchObject({
			inferred: true,
			inferredFrom: { attribute: 'db.system', value: 'postgresql' },
		});
		expect(nodes.postgresql.kind.kind).toBe('database');
		expect(nodes.kafka.kind.kind).toBe('queue');
		expect(graph.edges.map((edge) => edge.protocol)).toStrictEqual([
			'db',
			'messaging',
		]);
	});
});

describe('visibleGraph', () => {
	it('hides databases, caches, queues and externals with their edges', () => {
		const graph = visibleGraph(buildServiceGraph(hotrod), false);
		expect(graph.nodes.map((node) => node.id).sort()).toStrictEqual([
			'customer',
			'driver',
			'frontend',
			'payment',
			'route',
		]);
		expect(graph.edges.every((edge) => edge.target !== 'mysql')).toBe(true);
	});

	it('shows everything when dependencies are on', () => {
		const graph = buildServiceGraph(hotrod);
		expect(visibleGraph(graph, true)).toStrictEqual(graph);
	});
});

describe('scopeToServices', () => {
	it('keeps the services in scope, their calls and what they call', () => {
		const graph = scopeToServices(buildServiceGraph(hotrod), new Set(['driver']));
		expect(graph.nodes.map((node) => node.id).sort()).toStrictEqual([
			'driver',
			'frontend',
			'redis-manual',
		]);
	});

	it('changes nothing without a scope', () => {
		const graph = buildServiceGraph(hotrod);
		expect(scopeToServices(graph, null)).toBe(graph);
	});
});

describe('neighbourhood', () => {
	it('is the node, its callers and its callees', () => {
		const { edges } = buildServiceGraph(hotrod);
		expect(Array.from(neighbourhood('driver', edges)).sort()).toStrictEqual([
			'driver',
			'frontend',
			'redis-manual',
		]);
	});
});

describe('pathEdges', () => {
	it('pairs each hop with the next', () => {
		expect(Array.from(pathEdges(['a', 'b', 'c']))).toStrictEqual(['a>b', 'b>c']);
		expect(pathEdges(['a']).size).toBe(0);
	});
});
