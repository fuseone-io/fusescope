import { StatusTone } from 'components/PageTemplate/types';
import {
	ERROR_RATE_CRITICAL,
	ERROR_RATE_WARNING,
} from 'pages/Services/components/ServicesList/constants';

import { ColorMode, NodeHealth, RingTone } from '../types';

/** p99 in ms at which a node turns degraded, then critical. */
export const P99_DEGRADED = 800;
export const P99_CRITICAL = 2000;
/** p99 bands of the latency colouring, ms. */
export const P99_SLOW = 500;

const MIN_EDGE = 1;
const MAX_EDGE = 4.5;
const NODE = 40;
const MIN_NODE = 32;
const MAX_NODE = 56;

export function nodeHealth(
	errorRate: number,
	p99: number | undefined,
): NodeHealth {
	const latency = p99 ?? 0;
	if (errorRate >= ERROR_RATE_CRITICAL || latency >= P99_CRITICAL) {
		return 'critical';
	}
	if (errorRate >= ERROR_RATE_WARNING || latency >= P99_DEGRADED) {
		return 'degraded';
	}
	return 'healthy';
}

export const HEALTH_TONE: Record<NodeHealth, StatusTone> = {
	healthy: 'success',
	degraded: 'warning',
	critical: 'error',
};

export const HEALTH_LABEL: Record<NodeHealth, string> = {
	healthy: 'Healthy',
	degraded: 'Degraded',
	critical: 'Critical',
};

export function latencyTone(p99: number | undefined): StatusTone {
	if (p99 === undefined) {
		return 'neutral';
	}
	if (p99 >= P99_CRITICAL) {
		return 'error';
	}
	return p99 >= P99_SLOW ? 'warning' : 'success';
}

export function ringTone(
	node: { errorRate: number; p99?: number },
	mode: ColorMode,
): RingTone {
	if (mode === 'throughput') {
		return 'primary';
	}
	if (mode === 'latency') {
		return latencyTone(node.p99);
	}
	return HEALTH_TONE[nodeHealth(node.errorRate, node.p99)];
}

const logShare = (value: number, max: number): number =>
	max > 0 ? Math.min(1, Math.log10(value + 1) / Math.log10(max + 1)) : 0;

/** Node diameter in px; only throughput colouring sizes nodes by requests. */
export function nodeSize(
	rate: number,
	maxRate: number,
	mode: ColorMode,
): number {
	if (mode !== 'throughput') {
		return NODE;
	}
	return Math.round(MIN_NODE + (MAX_NODE - MIN_NODE) * logShare(rate, maxRate));
}

/** Line width in px, on a log scale of requests per second. */
export function edgeWidth(rate: number, maxRate: number): number {
	return MIN_EDGE + (MAX_EDGE - MIN_EDGE) * logShare(rate, maxRate);
}

export function edgeTone(errorRate: number): StatusTone {
	if (errorRate >= ERROR_RATE_CRITICAL) {
		return 'error';
	}
	return errorRate >= ERROR_RATE_WARNING ? 'warning' : 'neutral';
}
