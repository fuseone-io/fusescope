import { dependencyTiles, serviceTiles } from '../utils/tiles';
import { SERVICE_KIND_STUB } from './fixtures';

describe('serviceTiles', () => {
	it('shows each value with its change against the previous period', () => {
		const tiles = serviceTiles(
			{ requests: 100, rate: 2, errorRate: 10, p99: 300, apdex: 0.8 },
			{ requests: 50, rate: 1, errorRate: 2, p99: 300, apdex: 0.9 },
			{ rate: [1, 2], errorRate: [0, 10], p99: [300, 300] },
		);
		expect(
			tiles.map((tile) => [tile.label, tile.value, tile.delta?.text]),
		).toStrictEqual([
			['Throughput', '2.00 req/s', '↑2.0×'],
			['Error rate', '10.0%', '↑5.0×'],
			['p99 latency', '300 ms', 'no change'],
			['Apdex', '0.80', '−0.10'],
		]);
		expect(tiles[1].valueClassName).toBe('tw:text-error');
	});

	it('shows dashes and no deltas before the data arrives', () => {
		const tiles = serviceTiles(undefined, undefined, undefined);
		expect(tiles.map((tile) => tile.value)).toStrictEqual(['—', '—', '—', '—']);
		expect(tiles.every((tile) => tile.delta === undefined)).toBe(true);
	});
});

describe('dependencyTiles', () => {
	it('reads the callers measurements', () => {
		expect(
			dependencyTiles(
				{
					id: '1.2.3.4',
					inferred: true,
					kind: SERVICE_KIND_STUB,
					rate: 0.17,
					errorRate: 100,
				},
				1,
			).map((tile) => tile.value),
		).toStrictEqual(['0.17 req/s', '100%', '—', '1']);
	});
});
