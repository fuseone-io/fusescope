import { formatVital, rateVital, ratingShares } from '../vitals';

describe('rateVital', () => {
	it.each([
		['lcp', 2500, 'good'],
		['lcp', 2501, 'needs-improvement'],
		['lcp', 4000, 'needs-improvement'],
		['lcp', 4001, 'poor'],
		['inp', 200, 'good'],
		['inp', 201, 'needs-improvement'],
		['inp', 501, 'poor'],
		['cls', 0.1, 'good'],
		['cls', 0.11, 'needs-improvement'],
		['cls', 0.26, 'poor'],
		['fcp', 1800, 'good'],
		['fcp', 3001, 'poor'],
		['ttfb', 800, 'good'],
		['ttfb', 1801, 'poor'],
	] as const)('%s %d is %s', (name, value, rating) => {
		expect(rateVital(name, value)).toBe(rating);
	});

	it('has no rating without a value', () => {
		expect(rateVital('lcp', Number.NaN)).toBeUndefined();
	});
});

describe('formatVital', () => {
	it.each([
		['lcp', 2140, '2.14 s'],
		['lcp', 980, '980 ms'],
		['inp', 180.4, '180 ms'],
		['cls', 0.041, '0.04'],
		['ttfb', 1250, '1.25 s'],
		['cls', Number.NaN, '—'],
	] as const)('%s %d reads %s', (name, value, text) => {
		expect(formatVital(name, value)).toBe(text);
	});
});

describe('ratingShares', () => {
	it('splits counts into whole percentages that add up to 100', () => {
		expect(
			ratingShares({ good: 78, needsImprovement: 15, poor: 7 }),
		).toStrictEqual({
			good: 78,
			needsImprovement: 15,
			poor: 7,
		});
		const thirds = ratingShares({ good: 1, needsImprovement: 1, poor: 1 });
		expect(thirds.good + thirds.needsImprovement + thirds.poor).toBe(100);
	});

	it('is all zero without samples', () => {
		expect(ratingShares({ good: 0, needsImprovement: 0, poor: 0 })).toStrictEqual(
			{
				good: 0,
				needsImprovement: 0,
				poor: 0,
			},
		);
	});
});
