import { neighbourRows, operationRows } from '../utils/neighbours';
import { SERVICE_KIND_STUB } from './fixtures';

describe('neighbourRows', () => {
	const nodes = ['frontend', 'driver', 'redis', 'route'].map((id) => ({
		id,
		inferred: false,
		kind: SERVICE_KIND_STUB,
		rate: 1,
		errorRate: id === 'redis' ? 18.5 : 0,
	}));
	const edges = [
		{ source: 'frontend', target: 'driver', rate: 1, errorRate: 0, p99: 200 },
		{ source: 'driver', target: 'redis', rate: 5, errorRate: 18.5, p99: 40 },
		{ source: 'driver', target: 'route', rate: 9, errorRate: 0 },
		{ source: 'driver', target: 'driver', rate: 1, errorRate: 0 },
	];

	it('lists callers and calls, worst first, with the other node health', () => {
		expect(neighbourRows('driver', nodes, edges)).toStrictEqual({
			callers: [
				{ name: 'frontend', rate: 1, errorRate: 0, p99: 200, tone: 'success' },
			],
			calls: [
				{ name: 'redis', rate: 5, errorRate: 18.5, p99: 40, tone: 'error' },
				{ name: 'route', rate: 9, errorRate: 0, p99: undefined, tone: 'success' },
			],
		});
	});

	it('is empty for an entry point without calls', () => {
		expect(neighbourRows('route', nodes, [])).toStrictEqual({
			callers: [],
			calls: [],
		});
	});
});

describe('operationRows', () => {
	it('turns counts over the range into rates and errors into a share', () => {
		expect(
			operationRows(
				[
					{
						name: 'HTTP GET',
						numCalls: 360,
						errorCount: 36,
						p50: 1,
						p95: 2,
						p99: 4e7,
					},
				],
				3600,
			),
		).toStrictEqual([{ name: 'HTTP GET', rate: 0.1, errorRate: 10, p99: 40 }]);
	});
});
