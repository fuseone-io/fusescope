import { SessionTotals, VitalSummaries, VitalSummary } from './metricTypes';

export interface RouteVitals {
	route: string;
	/** Page loads that reported LCP. */
	loads: number;
	lcp?: VitalSummary;
	inp?: number;
	cls?: number;
	errors: number;
}

export interface ErrorGroup {
	type: string;
	message: string;
	route: string;
	events: number;
	sessions: number;
	lastSeen?: number;
}

export interface SessionSummary {
	id: string;
	start?: number;
	durationMs?: number;
	views: number;
	userAgent: string;
	release: string;
}

export interface SessionRequest {
	sessionId: string;
	traceId: string;
	spanId: string;
	label: string;
	durationMs: number;
	failed: boolean;
}

export interface ApplicationOverview {
	current: SessionTotals;
	previous?: SessionTotals;
	views: number;
	vitals: VitalSummaries;
	routes: RouteVitals[];
	routeCount: number;
	errors: ErrorGroup[];
	sessions: SessionSummary[];
	sdk?: { name: string; version: string };
	releases: string[];
}
