import {
	edgeTone,
	edgeWidth,
	latencyTone,
	nodeHealth,
	nodeSize,
	ringTone,
} from '../utils/health';

describe('nodeHealth', () => {
	it.each<[number, number | undefined, string]>([
		[0, 10, 'healthy'],
		[0, undefined, 'healthy'],
		[1, 10, 'degraded'],
		[0, 800, 'degraded'],
		[5, 10, 'critical'],
		[0, 2000, 'critical'],
		[18.5, 40, 'critical'],
	])('%s%% errors, p99 %s ms is %s', (errorRate, p99, expected) => {
		expect(nodeHealth(errorRate, p99)).toBe(expected);
	});
});

describe('latencyTone', () => {
	it.each<[number | undefined, string]>([
		[undefined, 'neutral'],
		[499, 'success'],
		[500, 'warning'],
		[1999, 'warning'],
		[2000, 'error'],
	])('p99 %s ms is %s', (p99, expected) => {
		expect(latencyTone(p99)).toBe(expected);
	});
});

describe('ringTone', () => {
	const node = { errorRate: 6, p99: 100 };
	it.each<[Parameters<typeof ringTone>[1], string]>([
		['health', 'error'],
		['latency', 'success'],
		['throughput', 'primary'],
	])('colours by %s', (mode, expected) => {
		expect(ringTone(node, mode)).toBe(expected);
	});
});

describe('nodeSize', () => {
	it('is fixed unless sized by throughput', () => {
		expect(nodeSize(5, 100, 'health')).toBe(nodeSize(100, 100, 'latency'));
	});

	it('grows with throughput, from the smallest to the largest', () => {
		const small = nodeSize(0, 100, 'throughput');
		const mid = nodeSize(10, 100, 'throughput');
		const large = nodeSize(100, 100, 'throughput');
		expect(small).toBeLessThan(mid);
		expect(mid).toBeLessThan(large);
	});
});

describe('edgeWidth', () => {
	it.each<[number, number, number]>([
		[0, 100, 1],
		[100, 100, 4.5],
		[5, 0, 1],
	])('%s req/s of at most %s is %s px', (rate, max, expected) => {
		expect(edgeWidth(rate, max)).toBeCloseTo(expected);
	});

	it('is proportional to the logarithm of the rate', () => {
		expect(edgeWidth(10, 100)).toBeGreaterThan(edgeWidth(1, 100));
	});
});

describe('edgeTone', () => {
	it.each<[number, string]>([
		[0, 'neutral'],
		[1, 'warning'],
		[5, 'error'],
	])('%s%% errors is %s', (errorRate, expected) => {
		expect(edgeTone(errorRate)).toBe(expected);
	});
});
