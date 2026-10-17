export enum ColumnKey {
	Application = 'serviceName',
	P99 = 'p99',
	ErrorRate = 'errorRate',
	Operations = 'callRate',
}

export const ColumnTitle: Record<ColumnKey, string> = {
	[ColumnKey.Application]: 'Application',
	[ColumnKey.P99]: 'P99 latency',
	[ColumnKey.ErrorRate]: 'Error Rate (% of total)',
	[ColumnKey.Operations]: 'Operations Per Second',
};

export const SEARCH_PLACEHOLDER = 'Search by service';

export const PAGE_SIZE = 10;

export const MAX_TOP_LEVEL_OPERATIONS = 2500;

/** Error-rate percentages at which the badge turns warning, then error. */
export const ERROR_RATE_WARNING = 1;
export const ERROR_RATE_CRITICAL = 5;
