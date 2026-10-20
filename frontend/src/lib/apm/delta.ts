import { DeltaKind, DeltaTone } from './types';

const MINUS = '−';
const NO_CHANGE = 'no change';
/** A change smaller than this share of the previous value reads as no change. */
const STEADY = 0.005;
/** A change of this share or more colours the delta. */
const NOTABLE = 0.1;

/** current ÷ previous; a value out of nothing is infinite, nothing out of nothing is 1. */
export function changeRatio(current: number, previous: number): number {
	if (previous > 0) {
		return current / previous;
	}
	return current > 0 ? Infinity : 1;
}

const signed = (value: number, digits: number, suffix = ''): string =>
	`${value >= 0 ? '+' : MINUS}${Math.abs(value).toFixed(digits)}${suffix}`;

/** "+30%", "−20%", or "↑2.1×" once the value at least doubled. */
export function relativeDelta(current: number, previous: number): string {
	const ratio = changeRatio(current, previous);
	if (ratio >= 2) {
		return ratio === Infinity ? '↑new' : `↑${ratio.toFixed(1)}×`;
	}
	if (Math.abs(ratio - 1) < STEADY) {
		return NO_CHANGE;
	}
	return signed((ratio - 1) * 100, 0, '%');
}

/** For percentages: "+0.2 pp", or "↑3.0×" once a non-zero rate at least doubled. */
export function percentPointDelta(current: number, previous: number): string {
	if (previous > 0 && changeRatio(current, previous) >= 2) {
		return `↑${changeRatio(current, previous).toFixed(1)}×`;
	}
	const difference = current - previous;
	if (Math.abs(difference) < 0.05) {
		return NO_CHANGE;
	}
	return signed(difference, 1, ' pp');
}

/** For scores such as Apdex: "−0.09". */
export function absoluteDelta(current: number, previous: number): string {
	const difference = current - previous;
	if (Math.abs(difference) < 0.005) {
		return NO_CHANGE;
	}
	return signed(difference, 2);
}

/** Whether a change is worth colouring, and which way. */
export function deltaTone(
	kind: DeltaKind,
	current: number,
	previous: number,
): DeltaTone {
	if (kind === 'neutral') {
		return 'neutral';
	}
	const ratio = changeRatio(current, previous);
	const rose = ratio >= 1 + NOTABLE;
	const fell = ratio <= 1 - NOTABLE;
	if (!rose && !fell) {
		return 'neutral';
	}
	const worse = kind === 'higher-is-bad' ? rose : fell;
	return worse ? 'bad' : 'good';
}
