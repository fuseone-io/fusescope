import { AppStartSummaries } from './appStart';
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

export interface SessionSummary {
	id: string;
	start?: number;
	durationMs?: number;
	views: number;
	userAgent: string;
	/** "Chrome 130 · Windows", or "Google Pixel 8 · Android 14" on mobile. */
	client: string;
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
	/** Android only. */
	appStart: AppStartSummaries;
	routes: RouteVitals[];
	routeCount: number;
	sessions: SessionSummary[];
	sdk?: { name: string; version: string };
	releases: string[];
}
