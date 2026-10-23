import { VitalRating } from 'lib/rum/types';

export type EventKindFilter =
	| 'all'
	| 'views'
	| 'actions'
	| 'requests'
	| 'errors'
	| 'vitals';

export type KindCounts = Record<EventKindFilter, number>;

export interface StripSegment {
	spanId: string;
	route: string;
	/** From the session start. */
	startMs: number;
	/** Percent of the strip. */
	left: number;
	width: number;
}

export interface ViewStrip {
	segments: StripSegment[];
	/** Distinct percent positions of clicks and custom actions. */
	actions: number[];
	errors: { left: number; title: string }[];
}

export interface RequestBar {
	spanId: string;
	label: string;
	/** Percent of the view's span. */
	left: number;
	width: number;
	durationMs: number;
	failed: boolean;
	slow: boolean;
}

export interface ViewSummary {
	requests: number;
	actions: number;
	errors: number;
	lcp?: { value: number; rating: VitalRating };
}

export type EventTone = 'neutral' | 'action' | 'error' | 'success' | 'warning';

export interface EventDescription {
	label: string;
	title: string;
	detail: string;
	tone: EventTone;
}
