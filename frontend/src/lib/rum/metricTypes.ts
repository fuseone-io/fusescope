import { RatingCounts, VitalName } from './types';

export interface VitalSummary {
	p75: number;
	samples: number;
	counts: RatingCounts;
}

export type VitalSummaries = Partial<Record<VitalName, VitalSummary>>;

export interface SessionTotals {
	sessions: number;
	sessionsWithErrors: number;
	/** Percent; undefined without sessions. */
	errorRate?: number;
}

export interface ApplicationMetrics {
	current: SessionTotals;
	previous?: SessionTotals;
	views: number;
	vitals: VitalSummaries;
	/** Epoch ms of the latest span. */
	lastSeen?: number;
	sdk?: { name: string; version: string };
	/** Spans per step, oldest first. */
	activity: number[];
}
