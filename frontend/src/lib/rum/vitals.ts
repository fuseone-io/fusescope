import { RatingCounts, VitalName, VitalRating } from './types';

/** Upper bounds of good and needs-improvement, from web.dev. */
export const VITAL_THRESHOLDS: Record<VitalName, [number, number]> = {
	lcp: [2500, 4000],
	inp: [200, 500],
	cls: [0.1, 0.25],
	fcp: [1800, 3000],
	ttfb: [800, 1800],
};

export const VITAL_TITLES: Record<VitalName, string> = {
	lcp: 'Largest Contentful Paint',
	inp: 'Interaction to Next Paint',
	cls: 'Cumulative Layout Shift',
	fcp: 'First Contentful Paint',
	ttfb: 'Time to First Byte',
};

export function rateVital(
	name: VitalName,
	value: number,
): VitalRating | undefined {
	if (!Number.isFinite(value)) {
		return undefined;
	}
	const [good, poor] = VITAL_THRESHOLDS[name];
	if (value <= good) {
		return 'good';
	}
	return value <= poor ? 'needs-improvement' : 'poor';
}

/** CLS is unitless; the others are milliseconds, shown in seconds from 1 s. */
export function formatVital(name: VitalName, value: number): string {
	if (!Number.isFinite(value)) {
		return '—';
	}
	if (name === 'cls') {
		return value.toFixed(2);
	}
	return value >= 1000
		? `${(value / 1000).toFixed(2)} s`
		: `${Math.round(value)} ms`;
}

/** "Good ≤ 2.5 s · Poor > 4 s". */
export function vitalThresholdsText(name: VitalName): string {
	const [good, poor] = VITAL_THRESHOLDS[name];
	const text = (value: number): string =>
		name === 'cls'
			? String(value)
			: value >= 1000
				? `${value / 1000} s`
				: `${value} ms`;
	return `Good ≤ ${text(good)} · Poor > ${text(poor)}`;
}

/** Whole percentages summing to 100, the remainder going to the largest share. */
export function ratingShares(counts: RatingCounts): RatingCounts {
	const total = counts.good + counts.needsImprovement + counts.poor;
	if (total <= 0) {
		return { good: 0, needsImprovement: 0, poor: 0 };
	}
	const needsImprovement = Math.round((counts.needsImprovement / total) * 100);
	const poor = Math.round((counts.poor / total) * 100);
	return { good: 100 - needsImprovement - poor, needsImprovement, poor };
}
