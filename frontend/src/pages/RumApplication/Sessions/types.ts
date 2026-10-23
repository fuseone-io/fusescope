export interface SessionFilters {
	browser: string;
	route: string;
	userId: string;
	/** On, only sessions with an error. */
	hasError: boolean;
	minDurationMs?: number;
	maxDurationMs?: number;
	/** 1-based. */
	page: number;
	pageSize: number;
}

export interface DurationRange {
	value: string;
	label: string;
	minDurationMs?: number;
	maxDurationMs?: number;
}
