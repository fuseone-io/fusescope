import { DeltaTextTone } from 'components/PageTemplate/components/DeltaText';
import {
	absoluteDelta,
	deltaTone,
	percentPointDelta,
	relativeDelta,
} from 'lib/apm/delta';
import {
	formatCount,
	formatLatencyMs,
	formatPercent,
	formatRate,
} from 'lib/apm/format';
import { DeltaKind, PeriodStats } from 'lib/apm/types';

/** A latency split into number and unit for a `Stat`. */
export function latencyParts(ms: number | undefined): {
	value: string;
	unit: string;
} {
	const [value, unit] = formatLatencyMs(ms).split(' ');
	return { value, unit: unit ?? '' };
}

export interface KpiDelta {
	text: string;
	tone: DeltaTextTone;
	previous: string;
}

export function relativeKpiDelta(
	current: number,
	previous: number,
	kind: DeltaKind,
	formatPrevious: (value: number) => string,
): KpiDelta {
	return {
		text: relativeDelta(current, previous),
		tone: deltaTone(kind, current, previous),
		previous: formatPrevious(previous),
	};
}

/** Error rate: percentage points, bad once it rose half a point. */
export function errorRateKpiDelta(current: number, previous: number): KpiDelta {
	const difference = current - previous;
	let tone: DeltaTextTone = 'neutral';
	if (difference > 0.5) {
		tone = 'bad';
	} else if (difference < -0.5) {
		tone = 'good';
	}
	return {
		text: percentPointDelta(current, previous),
		tone,
		previous: formatPercent(previous),
	};
}

export function apdexKpiDelta(current: number, previous: number): KpiDelta {
	return {
		text: absoluteDelta(current, previous),
		tone: deltaTone('lower-is-bad', current, previous),
		previous: previous.toFixed(2),
	};
}

type KpiKey =
	| 'requests'
	| 'rate'
	| 'errorRate'
	| 'errors'
	| 'p99'
	| 'avg'
	| 'apdex';

/** Each KPI's change against the previous period; none without one. */
export function kpiDeltas(
	current: PeriodStats | undefined,
	previous: PeriodStats | undefined,
): Partial<Record<KpiKey, KpiDelta>> {
	if (!current || !previous) {
		return {};
	}
	const apdex =
		current.apdex !== undefined && previous.apdex !== undefined
			? apdexKpiDelta(current.apdex, previous.apdex)
			: undefined;
	return {
		requests: relativeKpiDelta(
			current.requests,
			previous.requests,
			'neutral',
			formatCount,
		),
		rate: relativeKpiDelta(current.rate, previous.rate, 'neutral', formatRate),
		errorRate: errorRateKpiDelta(current.errorRate, previous.errorRate),
		errors: relativeKpiDelta(
			current.errors ?? 0,
			previous.errors ?? 0,
			'higher-is-bad',
			formatCount,
		),
		p99: relativeKpiDelta(
			current.p99,
			previous.p99,
			'higher-is-bad',
			formatLatencyMs,
		),
		avg: relativeKpiDelta(
			current.avg ?? 0,
			previous.avg ?? 0,
			'higher-is-bad',
			formatLatencyMs,
		),
		apdex,
	};
}
