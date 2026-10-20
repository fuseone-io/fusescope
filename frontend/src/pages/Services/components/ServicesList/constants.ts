export enum ColumnKey {
	Application = 'serviceName',
	P99 = 'p99',
	ErrorRate = 'errorRate',
	Operations = 'callRate',
	Requests = 'numCalls',
}

export type ServiceSortKey = ColumnKey | 'flag';

export const ColumnTitle: Record<ColumnKey, string> = {
	[ColumnKey.Application]: 'Service',
	[ColumnKey.P99]: 'p99 latency',
	[ColumnKey.ErrorRate]: 'Error %',
	[ColumnKey.Operations]: 'Rate',
	[ColumnKey.Requests]: 'Requests',
};

export const SEARCH_PLACEHOLDER = 'Search by service';

export const PAGE_SIZE = 10;

export const MAX_TOP_LEVEL_OPERATIONS = 2500;

/** Error-rate percentages at which the badge turns warning, then error. */
export const ERROR_RATE_WARNING = 1;
export const ERROR_RATE_CRITICAL = 5;
