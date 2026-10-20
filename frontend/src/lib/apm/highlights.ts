import { changeRatio } from './delta';
import { formatLatencyMs, formatPercent, formatRate } from './format';
import {
	FailingDependency,
	Highlight,
	PeriodStats,
	ServiceBadge,
} from './types';

/** Error rate, in percent, that is flagged whatever the previous period. */
export const SEVERE_ERROR_RATE = 50;
/** Below this error rate a doubling is noise. */
const MIN_FLAGGED_ERROR_RATE = 1;
const DOUBLED = 2;

function errorsBadge(
	current: PeriodStats,
	previous: PeriodStats | undefined,
): ServiceBadge | null {
	if (current.errorRate >= SEVERE_ERROR_RATE) {
		return {
			kind: 'errors',
			tone: 'error',
			text: `${formatPercent(current.errorRate)} errors`,
			reason: `Error rate at or above ${SEVERE_ERROR_RATE}%`,
		};
	}
	if (!previous || current.errorRate < MIN_FLAGGED_ERROR_RATE) {
		return null;
	}
	const ratio = changeRatio(current.errorRate, previous.errorRate);
	if (ratio < DOUBLED) {
		return null;
	}
	return {
		kind: 'errors',
		tone: 'error',
		text: ratio === Infinity ? 'new errors' : `errors ↑${Math.round(ratio)}×`,
		reason: `Error rate ${formatPercent(current.errorRate)} vs ${formatPercent(previous.errorRate)} in the previous period`,
	};
}

function doubledBadge(
	kind: 'p99' | 'rate',
	current: number,
	previous: number | undefined,
): ServiceBadge | null {
	if (!previous || previous <= 0 || current / previous < DOUBLED) {
		return null;
	}
	const factor = Math.floor(current / previous);
	const format = kind === 'p99' ? formatLatencyMs : formatRate;
	return {
		kind,
		tone: kind === 'p99' ? 'warning' : 'info',
		text: `${kind} ↑${factor}×`,
		reason: `${kind === 'p99' ? 'p99' : 'Request rate'} ${format(current)} vs ${format(previous)} in the previous period`,
	};
}

/** The list's badges: 2× error rate, p99 or throughput, or 50% errors. */
export function serviceBadges(
	current: PeriodStats,
	previous: PeriodStats | undefined,
): ServiceBadge[] {
	return [
		errorsBadge(current, previous),
		doubledBadge('p99', current.p99, previous?.p99),
		doubledBadge('rate', current.rate, previous?.rate),
	].filter((badge): badge is ServiceBadge => badge !== null);
}

interface HighlightInput {
	current: PeriodStats;
	previous: PeriodStats | undefined;
	failingDependencies: FailingDependency[];
}

function badgeHighlight(
	badge: ServiceBadge,
	current: PeriodStats,
	previous: PeriodStats | undefined,
): Highlight {
	if (badge.kind === 'p99') {
		const ratio = changeRatio(current.p99, previous?.p99 ?? 0);
		return {
			id: 'p99',
			tone: 'warning',
			title: `p99 latency ↑${ratio.toFixed(1)}×`,
			detail: `${formatLatencyMs(current.p99)} against ${formatLatencyMs(previous?.p99)} in the previous period.`,
			links: ['slowTraces', 'endpoints'],
		};
	}
	if (badge.kind === 'rate') {
		return {
			id: 'rate',
			tone: 'info',
			title: `Throughput ${badge.text.replace('rate ', '')}`,
			detail: `${formatRate(current.rate)} against ${formatRate(previous?.rate)} in the previous period.`,
			links: ['endpoints'],
		};
	}
	const detail = previous
		? `${formatPercent(current.errorRate)} of requests failed, against ${formatPercent(previous.errorRate)} in the previous period.`
		: `${formatPercent(current.errorRate)} of requests failed.`;
	return {
		id: 'errors',
		tone: 'error',
		title: `Error rate ${badge.text.replace(' errors', '').replace('errors ', '')}`,
		detail,
		links: ['errorTraces', 'endpoints'],
	};
}

/** The Overview's callouts: the list's rules plus downstream calls failing half the time. */
export function serviceHighlights({
	current,
	previous,
	failingDependencies,
}: HighlightInput): Highlight[] {
	const fromBadges = serviceBadges(current, previous).map((badge) =>
		badgeHighlight(badge, current, previous),
	);
	const fromDependencies = failingDependencies
		.filter((dependency) => dependency.errorRate >= SEVERE_ERROR_RATE)
		.map(
			(dependency): Highlight => ({
				id: `dependency-${dependency.name}`,
				tone: 'error',
				title: `Downstream ${dependency.name} fails ${formatPercent(dependency.errorRate)} of calls`,
				detail: `${formatPercent(dependency.errorRate)} of calls returned an error, at ${formatRate(dependency.rate)}.`,
				links: ['dependencies', 'errorTraces'],
			}),
		);
	return [...fromBadges, ...fromDependencies];
}
