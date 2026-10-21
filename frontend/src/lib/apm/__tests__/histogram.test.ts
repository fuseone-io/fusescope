import {
	apdexFromBuckets,
	latencyBuckets,
	percentileBucket,
} from '../histogram';

const cumulative = [
	{ le: '10', count: 430 },
	{ le: '+Inf', count: 6120 },
	{ le: '500', count: 2800 },
	{ le: '100', count: 500 },
	{ le: '1000', count: 5660 },
	{ le: '250', count: 660 },
	{ le: '2500', count: 6112 },
	{ le: '50', count: 482 },
];

describe('latencyBuckets', () => {
	it('turns cumulative le counts into per-bucket counts in order', () => {
		expect(latencyBuckets(cumulative)).toStrictEqual([
			{ le: 10, label: '≤10', count: 430, cumulative: 430 },
			{ le: 50, label: '50', count: 52, cumulative: 482 },
			{ le: 100, label: '100', count: 18, cumulative: 500 },
			{ le: 250, label: '250', count: 160, cumulative: 660 },
			{ le: 500, label: '500', count: 2140, cumulative: 2800 },
			{ le: 1000, label: '1k', count: 2860, cumulative: 5660 },
			{ le: 2500, label: '2.5k', count: 452, cumulative: 6112 },
			{ le: Infinity, label: '>2.5k', count: 8, cumulative: 6120 },
		]);
	});

	it('drops empty buckets beyond the last request', () => {
		expect(
			latencyBuckets([
				{ le: '10', count: 5 },
				{ le: '20', count: 5 },
				{ le: '+Inf', count: 5 },
			]).map((bucket) => bucket.label),
		).toStrictEqual(['≤10']);
		expect(latencyBuckets([])).toStrictEqual([]);
	});

	it('never lets a counter reset go negative', () => {
		expect(
			latencyBuckets([
				{ le: '10', count: 8 },
				{ le: '20', count: 6 },
				{ le: '+Inf', count: 10 },
			]).map((bucket) => bucket.count),
		).toStrictEqual([8, 0, 2]);
	});
});

describe('percentileBucket', () => {
	it('finds the bucket the percentile falls in', () => {
		const buckets = latencyBuckets(cumulative);
		expect(buckets[percentileBucket(buckets, 50)].label).toBe('1k');
		expect(buckets[percentileBucket(buckets, 99)].label).toBe('2.5k');
		expect(buckets[percentileBucket(buckets, 5)].label).toBe('≤10');
		expect(percentileBucket([], 50)).toBe(-1);
	});
});

describe('apdexFromBuckets', () => {
	it('reads T and 4T at the next bucket bound up, over all requests', () => {
		const buckets = latencyBuckets(cumulative);
		// T = 500 ms: 2,800 satisfied; 4T = 2 s rounds up to the ≤ 2.5k bucket.
		expect(apdexFromBuckets(buckets, 500, 6120)).toBeCloseTo(
			(2800 + (6112 - 2800) / 2) / 6120,
			5,
		);
		// 120 more requests failed: they only add to the total.
		expect(apdexFromBuckets(buckets, 500, 6240)).toBeCloseTo(
			(2800 + (6112 - 2800) / 2) / 6240,
			5,
		);
		expect(apdexFromBuckets([], 500, 10)).toBe(0);
		expect(apdexFromBuckets([], 500, 0)).toBeUndefined();
	});
});
