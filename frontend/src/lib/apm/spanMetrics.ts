/** Span metric names; latency is reported in ms. */
export const SPAN_METRIC = {
	calls: 'signoz_calls_total',
	latencyBucket: 'signoz_latency.bucket',
	latencySum: 'signoz_latency.sum',
	latencyCount: 'signoz_latency.count',
	externalCount: 'signoz_external_call_latency_count',
	externalSum: 'signoz_external_call_latency_sum',
} as const;

export const NS_PER_MS = 1e6;
