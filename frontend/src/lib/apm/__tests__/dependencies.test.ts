import { isHostlessAddress, serviceDependencies } from '../dependencies';

const edge = (
	parent: string,
	child: string,
	errorRate = 0,
): {
	parent: string;
	child: string;
	callCount: number;
	callRate: number;
	errorRate: number;
	p50: number;
	p99: number;
} => ({
	parent,
	child,
	callCount: 100,
	callRate: 1.4,
	errorRate,
	p50: 21_000_000,
	p99: 59_000_000,
});

const EDGES = [
	edge('frontend', 'route'),
	edge('frontend', 'customer'),
	edge('customer', 'mysql'),
	edge('driver', 'redis-manual', 18.5),
	edge('frontend', 'driver'),
];

describe('isHostlessAddress', () => {
	it.each([
		['0.0.0.0:', true],
		[':8080', true],
		['', true],
		['host:', true],
		['1.2.3.4', false],
		['mysql', false],
		['driver.DriverService/FindNearest', false],
	])('%s → %s', (address, expected) => {
		expect(isHostlessAddress(address)).toBe(expected);
	});
});

describe('serviceDependencies', () => {
	it('splits the graph into callers and callees of the service', () => {
		const { upstream, downstream } = serviceDependencies({
			servicename: 'driver',
			edges: EDGES,
			databases: [],
			externals: [],
		});
		expect(upstream.map((item) => item.name)).toStrictEqual(['frontend']);
		expect(downstream).toStrictEqual([
			{
				name: 'redis-manual',
				kind: 'Service',
				rate: 1.4,
				p50: 21,
				p99: 59,
				errorRate: 18.5,
			},
		]);
	});

	it('marks callees reached through a database peer as databases', () => {
		const { downstream } = serviceDependencies({
			servicename: 'customer',
			edges: EDGES,
			databases: ['mysql'],
			externals: [],
		});
		expect(downstream.map((item) => [item.name, item.kind])).toStrictEqual([
			['mysql', 'Database'],
		]);
	});

	it('adds external addresses, without host-less ones or traced services', () => {
		const { downstream } = serviceDependencies({
			servicename: 'frontend',
			edges: EDGES,
			databases: [],
			externals: [
				{ address: '0.0.0.0:', rate: 4, errorRate: 0, avg: 70 },
				{ address: 'route', rate: 4, errorRate: 0, avg: 70 },
				{ address: '1.2.3.4', rate: 0.2, errorRate: 100, avg: 83 },
			],
		});
		expect(downstream.map((item) => [item.name, item.kind])).toStrictEqual([
			['1.2.3.4', 'External'],
			['route', 'Service'],
			['customer', 'Service'],
			['driver', 'Service'],
		]);
		expect(downstream[0]).toStrictEqual(
			expect.objectContaining({ errorRate: 100, p50: undefined, p99: undefined }),
		);
	});
});
