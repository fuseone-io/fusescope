export type VitalName = 'lcp' | 'inp' | 'cls' | 'fcp' | 'ttfb';

export type VitalRating = 'good' | 'needs-improvement' | 'poor';

export interface RatingCounts {
	good: number;
	needsImprovement: number;
	poor: number;
}

export type SdkSupport = 'supported' | 'outdated' | 'other' | 'unknown';

export interface SupportedSdk {
	name: string;
	/** Inclusive. */
	minVersion: string;
	/** Exclusive. */
	maxVersion: string;
}
