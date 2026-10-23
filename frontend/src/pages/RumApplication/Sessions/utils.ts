import type { ListRUMSessionsParams } from 'api/generated/services/fuseScope.schemas';

import {
	ANY_DURATION,
	CUSTOM_DURATION,
	DEFAULT_PAGE_SIZE,
	DURATION_RANGES,
	PAGE_SIZES,
	PARAMS,
} from './constants';
import { SessionFilters } from './types';

function positiveInt(value: string | null): number | undefined {
	if (value === null || !/^\d+$/.test(value)) {
		return undefined;
	}
	const parsed = Number(value);
	return parsed > 0 ? parsed : undefined;
}

export function parseSessionFilters(search: string): SessionFilters {
	const params = new URLSearchParams(search);
	const pageSize = positiveInt(params.get(PARAMS.pageSize));
	return {
		browser: params.get(PARAMS.browser) ?? '',
		route: params.get(PARAMS.route) ?? '',
		userId: params.get(PARAMS.userId) ?? '',
		hasError: params.get(PARAMS.hasError) === 'true',
		minDurationMs: positiveInt(params.get(PARAMS.minDurationMs)),
		maxDurationMs: positiveInt(params.get(PARAMS.maxDurationMs)),
		page: positiveInt(params.get(PARAMS.page)) ?? 1,
		pageSize:
			pageSize !== undefined && PAGE_SIZES.includes(pageSize)
				? pageSize
				: DEFAULT_PAGE_SIZE,
	};
}

function serialize(
	key: keyof SessionFilters,
	value: SessionFilters[keyof SessionFilters],
): string | undefined {
	if (key === 'hasError') {
		return value ? 'true' : undefined;
	}
	if (key === 'page') {
		return value === 1 ? undefined : String(value);
	}
	if (key === 'pageSize') {
		return value === DEFAULT_PAGE_SIZE ? undefined : String(value);
	}
	return value === undefined || value === '' ? undefined : String(value);
}

/**
 * `search` with the filters in `patch` applied. Any change but the page goes
 * back to the first page; params that aren't filters are kept.
 */
export function writeSessionFilters(
	search: string,
	patch: Partial<SessionFilters>,
): string {
	const params = new URLSearchParams(search);
	const next: Partial<SessionFilters> =
		'page' in patch ? patch : { ...patch, page: 1 };
	(Object.keys(next) as (keyof SessionFilters)[]).forEach((key) => {
		const value = serialize(key, next[key]);
		if (value === undefined) {
			params.delete(PARAMS[key]);
		} else {
			params.set(PARAMS[key], value);
		}
	});
	const query = params.toString();
	return query ? `?${query}` : '';
}

export function sessionListParams(
	filters: SessionFilters,
	window: { start: number; end: number },
	release?: string,
): ListRUMSessionsParams {
	const params: ListRUMSessionsParams = {
		start: window.start,
		end: window.end,
	};
	if (release) {
		params.release = release;
	}
	if (filters.browser) {
		params.browser = filters.browser;
	}
	if (filters.route) {
		params.route = filters.route;
	}
	if (filters.userId) {
		params.userId = filters.userId;
	}
	if (filters.hasError) {
		params.hasError = true;
	}
	if (filters.minDurationMs !== undefined) {
		params.minDurationMs = filters.minDurationMs;
	}
	if (filters.maxDurationMs !== undefined) {
		params.maxDurationMs = filters.maxDurationMs;
	}
	params.limit = filters.pageSize;
	params.offset = (filters.page - 1) * filters.pageSize;
	return params;
}

/** The preset matching a duration filter, `custom` for one typed in the URL. */
export function durationRangeOf(
	minDurationMs: number | undefined,
	maxDurationMs: number | undefined,
): string {
	if (minDurationMs === undefined && maxDurationMs === undefined) {
		return ANY_DURATION;
	}
	return (
		DURATION_RANGES.find(
			(range) =>
				range.minDurationMs === minDurationMs &&
				range.maxDurationMs === maxDurationMs,
		)?.value ?? CUSTOM_DURATION
	);
}
