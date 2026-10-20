/** One service's golden signals over a period; latency in ms, rates per second. */
export interface PeriodStats {
	requests: number;
	rate: number;
	/** Percent of requests that failed, 0–100. */
	errorRate: number;
	p99: number;
	errors?: number;
	p50?: number;
	p95?: number;
	avg?: number;
	apdex?: number;
}

export type DeltaKind = 'higher-is-bad' | 'lower-is-bad' | 'neutral';

export type DeltaTone = 'bad' | 'good' | 'neutral';

export type BadgeTone = 'error' | 'warning' | 'info';

export interface ServiceBadge {
	kind: 'errors' | 'p99' | 'rate';
	tone: BadgeTone;
	text: string;
	/** Why the badge shows, for its tooltip. */
	reason: string;
}

export type HighlightLink =
	| 'slowTraces'
	| 'errorTraces'
	| 'endpoints'
	| 'dependencies';

export interface Highlight {
	id: string;
	tone: BadgeTone;
	title: string;
	detail: string;
	links: HighlightLink[];
}

export interface FailingDependency {
	name: string;
	errorRate: number;
	rate: number;
}

/** Where a service's RED metrics come from; follows the `use_span_metrics` flag. */
export type ApmSource = 'span-metrics' | 'traces';
