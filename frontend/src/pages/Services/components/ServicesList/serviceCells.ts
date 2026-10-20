import { DeltaTextTone } from 'components/PageTemplate/components/DeltaText';
import { StatusTone } from 'components/PageTemplate/types';
import { deltaTone, percentPointDelta, relativeDelta } from 'lib/apm/delta';
import { BadgeTone } from 'lib/apm/types';

import { ServiceRow } from './serviceRows';

interface Delta {
	text: string;
	tone: DeltaTextTone;
}

/** Percentage points an error rate must move by to colour its delta. */
const ERROR_RATE_STEP = 0.5;

export function rateDelta(row: ServiceRow): Delta | undefined {
	const previous = row.apm?.previous;
	if (!row.apm || !previous) {
		return undefined;
	}
	return {
		text: relativeDelta(row.apm.current.rate, previous.rate),
		tone: 'neutral',
	};
}

export function errorRateDelta(row: ServiceRow): Delta | undefined {
	const previous = row.apm?.previous;
	if (!row.apm || !previous) {
		return undefined;
	}
	const difference = row.apm.current.errorRate - previous.errorRate;
	let tone: DeltaTextTone = 'neutral';
	if (difference > ERROR_RATE_STEP) {
		tone = 'bad';
	} else if (difference < -ERROR_RATE_STEP) {
		tone = 'good';
	}
	return {
		text: percentPointDelta(row.apm.current.errorRate, previous.errorRate),
		tone,
	};
}

export function p99Delta(row: ServiceRow): Delta | undefined {
	const previous = row.apm?.previous;
	if (!row.apm || !previous) {
		return undefined;
	}
	return {
		text: relativeDelta(row.apm.current.p99, previous.p99),
		tone: deltaTone('higher-is-bad', row.apm.current.p99, previous.p99),
	};
}

export const BADGE_TONE: Record<BadgeTone, StatusTone> = {
	error: 'error',
	warning: 'warning',
	info: 'info',
};
