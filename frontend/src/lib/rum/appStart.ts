import { quote } from 'lib/apm/filters';

import { RUM_ATTRIBUTES } from './attributes';
import { VitalSummary } from './metricTypes';
import { numberCell } from './queryRange';
import { VitalRating } from './types';

export const START_TYPES = ['cold', 'warm', 'hot'] as const;

export type StartType = (typeof START_TYPES)[number];

export type AppStartSummaries = Partial<Record<StartType, VitalSummary>>;

/**
 * Upper bounds of good and needs-improvement in ms, as the Android SDK rates
 * `app_start`: poor from 5 s cold, 2 s warm, 1.5 s hot; good below half.
 */
export const APP_START_THRESHOLDS: Record<StartType, [number, number]> = {
	cold: [2500, 5000],
	warm: [1000, 2000],
	hot: [750, 1500],
};

const ratingCountIf = (rating: VitalRating): string =>
	`countIf(${RUM_ATTRIBUTES.appVitalRating} = ${quote(rating)})`;

export const APP_START_AGGREGATIONS = [
	`p75(${RUM_ATTRIBUTES.appVitalValue})`,
	ratingCountIf('good'),
	ratingCountIf('needs-improvement'),
	ratingCountIf('poor'),
];

const isStartType = (value: string): value is StartType =>
	START_TYPES.some((type) => type === value);

/** Summaries of rows grouped by `start.type`. */
export function appStartSummaries(
	rows: { labels: Record<string, string>; values: unknown[] }[],
): AppStartSummaries {
	const summaries: AppStartSummaries = {};
	rows.forEach(({ labels, values }) => {
		const type = labels[RUM_ATTRIBUTES.startType]?.toLowerCase() ?? '';
		if (!isStartType(type)) {
			return;
		}
		const [p75, good, needsImprovement, poor] = values.map(numberCell);
		const counts = {
			good: good || 0,
			needsImprovement: needsImprovement || 0,
			poor: poor || 0,
		};
		summaries[type] = {
			p75,
			counts,
			samples: counts.good + counts.needsImprovement + counts.poor,
		};
	});
	return summaries;
}

export function rateAppStart(
	type: StartType,
	value: number,
): VitalRating | undefined {
	if (!Number.isFinite(value)) {
		return undefined;
	}
	const [good, poor] = APP_START_THRESHOLDS[type];
	if (value < good) {
		return 'good';
	}
	return value < poor ? 'needs-improvement' : 'poor';
}

/** "Good < 2.5 s · Poor ≥ 5 s". */
export function appStartThresholdsText(type: StartType): string {
	const [good, poor] = APP_START_THRESHOLDS[type];
	return `Good < ${good / 1000} s · Poor ≥ ${poor / 1000} s`;
}
