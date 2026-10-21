import { ServiceApm } from 'lib/apm/servicesList';
import { ServicesList } from 'types/api/metrics/getService';

import { homeServiceRows } from '../homeServiceRows';

const service = (
	serviceName: string,
	errorRate: number,
	p99Ns: number,
): ServicesList => ({
	serviceName,
	p99: p99Ns,
	avgDuration: 0,
	numCalls: 100,
	callRate: 1,
	numErrors: 0,
	errorRate,
});

const apm = (errorRate: number, previousErrorRate: number): ServiceApm => ({
	current: { requests: 100, rate: 1, errorRate, p99: 10 },
	previous: { requests: 100, rate: 1, errorRate: previousErrorRate, p99: 10 },
	sparks: { rate: [], errorRate: [], p99: [] },
});

interface Case {
	name: string;
	services: ServicesList[];
	stats: Record<string, ServiceApm>;
	expected: string[];
}

describe('homeServiceRows', () => {
	it.each<Case>([
		{
			name: 'orders by error rate, then p99',
			services: [
				service('cart', 0, 64e6),
				service('payment', 13, 2940e6),
				service('frontend', 0, 612e6),
				service('checkout', 4.1, 1420e6),
			],
			stats: {},
			expected: ['payment', 'checkout', 'frontend', 'cart'],
		},
		{
			name: 'puts highlighted services first',
			services: [service('payment', 13, 1e6), service('redis', 2, 1e6)],
			stats: { redis: apm(2, 0.5) },
			expected: ['redis', 'payment'],
		},
		{
			name: 'keeps the top five',
			services: ['a', 'b', 'c', 'd', 'e', 'f'].map((name, index) =>
				service(name, index, 1e6),
			),
			stats: {},
			expected: ['f', 'e', 'd', 'c', 'b'],
		},
	])('$name', ({ services, stats, expected }) => {
		expect(
			homeServiceRows(services, stats, false).map((row) => row.serviceName),
		).toStrictEqual(expected);
	});

	it('reads trace p99 in nanoseconds and span-metrics p99 in milliseconds', () => {
		const [fromTraces] = homeServiceRows([service('a', 0, 5e6)], {}, false);
		const [fromMetrics] = homeServiceRows([service('a', 0, 5)], {}, true);

		expect(fromTraces.p99).toBe(5);
		expect(fromMetrics.p99).toBe(5);
	});
});
