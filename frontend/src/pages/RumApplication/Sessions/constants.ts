import { DurationRange } from './types';

export const PAGE_SIZES = [20, 50, 100];
export const DEFAULT_PAGE_SIZE = 50;

export const ANY_DURATION = 'any';
export const CUSTOM_DURATION = 'custom';

const SECOND = 1000;
const MINUTE = 60 * SECOND;

export const DURATION_RANGES: DurationRange[] = [
	{ value: ANY_DURATION, label: 'Any' },
	{ value: 'lt10s', label: '< 10 s', maxDurationMs: 10 * SECOND },
	{
		value: '10s-1m',
		label: '10 s – 1 min',
		minDurationMs: 10 * SECOND,
		maxDurationMs: MINUTE,
	},
	{ value: 'gte1m', label: '≥ 1 min', minDurationMs: MINUTE },
	{ value: 'gte5m', label: '≥ 5 min', minDurationMs: 5 * MINUTE },
	{ value: 'gte15m', label: '≥ 15 min', minDurationMs: 15 * MINUTE },
];

/** Browser names the SDK's user agent parser returns, offered before any data. */
export const COMMON_BROWSERS = ['Chrome', 'Safari', 'Firefox', 'Edge'];

/** URL params, as written by `writeSessionFilters`. */
export const PARAMS = {
	browser: 'browser',
	route: 'route',
	userId: 'userId',
	hasError: 'hasError',
	minDurationMs: 'minDuration',
	maxDurationMs: 'maxDuration',
	page: 'page',
	pageSize: 'pageSize',
} as const;
