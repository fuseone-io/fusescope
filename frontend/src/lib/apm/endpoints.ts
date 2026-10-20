import { ApmWindow } from './window';

export const NOT_SET = '(not set)';

/** One operation or attribute value; latency in ms. */
export interface EndpointStats {
	name: string;
	p50: number;
	p95: number;
	p99: number;
	numCalls: number;
	errorCount: number;
}

export interface EndpointTotals {
	requests: number;
	/** Sum of span durations, ms. */
	durationMs: number;
}

export interface EndpointSparks {
	rate: number[];
	p99: number[];
}

export interface EndpointRow {
	key: string;
	name: string;
	/** Spans without the grouped attribute. */
	notSet: boolean;
	requests: number;
	rate: number;
	errorRate: number;
	avg?: number;
	p50?: number;
	p95?: number;
	p99?: number;
	/** Share of the service's time spent in this row, 0–100. */
	share: number;
	sparks: EndpointSparks;
}

interface EndpointInput {
	window: ApmWindow;
	operations: EndpointStats[];
	totals: Record<string, EndpointTotals>;
	sparks: Record<string, EndpointSparks>;
}

const EMPTY_SPARKS: EndpointSparks = { rate: [], p99: [] };

/**
 * Rows of the Endpoints table: percentiles and calls per row, with rate,
 * average and "% time spent" (its share of the summed span duration).
 */
export function endpointRows({
	window,
	operations,
	totals,
	sparks,
}: EndpointInput): EndpointRow[] {
	const totalDuration = Object.values(totals).reduce(
		(sum, item) => sum + item.durationMs,
		0,
	);
	return operations.map((operation) => {
		const notSet = operation.name === '';
		const total = totals[operation.name];
		const requests = operation.numCalls;
		return {
			key: operation.name || NOT_SET,
			name: notSet ? NOT_SET : operation.name,
			notSet,
			requests,
			rate: requests / window.seconds,
			errorRate: requests > 0 ? (operation.errorCount / requests) * 100 : 0,
			avg:
				total && total.requests > 0 ? total.durationMs / total.requests : undefined,
			p50: notSet ? undefined : operation.p50,
			p95: notSet ? undefined : operation.p95,
			p99: notSet ? undefined : operation.p99,
			share:
				total && totalDuration > 0 ? (total.durationMs / totalDuration) * 100 : 0,
			sparks: sparks[operation.name] ?? EMPTY_SPARKS,
		};
	});
}

export interface TopOperationLike {
	name: string;
	p50: number;
	p95: number;
	p99: number;
	numCalls: number;
	errorCount: number;
}
