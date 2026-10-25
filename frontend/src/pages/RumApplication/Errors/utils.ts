import type {
	ListRUMErrorGroupsParams,
	RumtypesErrorGroupDTO,
} from 'api/generated/services/fuseScope.schemas';
import { frameLabel, isLibraryFile, isScriptFile } from 'lib/rum/stackFrames';

import {
	ERROR_SOURCES,
	GROUP_LIMIT,
	ROUTE_PARAM,
	SEARCH_PARAM,
	SOURCE_PARAM,
} from './constants';
import { ErrorFilters, ErrorSource } from './types';

const isErrorSource = (value: string): value is ErrorSource =>
	ERROR_SOURCES.some((source) => source === value);

export function parseErrorFilters(search: string): ErrorFilters {
	const params = new URLSearchParams(search);
	const source = params.get(SOURCE_PARAM) ?? '';
	return {
		search: params.get(SEARCH_PARAM) ?? '',
		source: isErrorSource(source) ? source : '',
		route: params.get(ROUTE_PARAM) ?? '',
	};
}

const PARAMS: Record<keyof ErrorFilters, string> = {
	search: SEARCH_PARAM,
	source: SOURCE_PARAM,
	route: ROUTE_PARAM,
};
const FILTER_KEYS = ['search', 'source', 'route'] as const;

/** `search` with the patch applied; empty values are removed. */
export function writeErrorFilters(
	search: string,
	patch: Partial<ErrorFilters>,
): string {
	const params = new URLSearchParams(search);
	FILTER_KEYS.forEach((key) => {
		if (!(key in patch)) {
			return;
		}
		const value = patch[key];
		if (value) {
			params.set(PARAMS[key], value);
		} else {
			params.delete(PARAMS[key]);
		}
	});
	const query = params.toString();
	return query ? `?${query}` : '';
}

export function errorListParams(
	window: { start: number; end: number },
	release: string,
): ListRUMErrorGroupsParams {
	return {
		start: window.start,
		end: window.end,
		...(release ? { release } : {}),
		limit: GROUP_LIMIT,
	};
}

export function filterGroups(
	groups: RumtypesErrorGroupDTO[],
	filters: ErrorFilters,
): RumtypesErrorGroupDTO[] {
	const needle = filters.search.trim().toLowerCase();
	return groups.filter(
		(group) =>
			(!filters.source || group.source === filters.source) &&
			(!filters.route || group.route === filters.route) &&
			(!needle ||
				[group.type, group.message, frameLabel(group.topFrame)].some((text) =>
					text.toLowerCase().includes(needle),
				)),
	);
}

/** "0.44%" of the range's sessions; two decimals below 1%. */
export function sessionShare(
	sessions: number,
	total: number,
): string | undefined {
	if (total <= 0) {
		return undefined;
	}
	const percent = (sessions / total) * 100;
	return `${percent.toFixed(percent < 1 ? 2 : 1)}%`;
}

/** The last release seen, and how many others the group appeared in. */
export function releasesSummary(group: RumtypesErrorGroupDTO): {
	first: string;
	more: number;
} {
	const releases = group.releases ?? [];
	if (releases.length === 0) {
		return { first: '', more: 0 };
	}
	const first = releases.includes(group.lastSeenRelease)
		? group.lastSeenRelease
		: releases[0];
	return { first, more: releases.length - 1 };
}

/**
 * The group's last release has no uploaded maps while its top frame points at
 * a script file; `uploaded` is undefined until the uploads are known.
 */
export function sourceMapMissing(
	group: RumtypesErrorGroupDTO,
	uploaded: Set<string> | undefined,
	jvm = false,
): boolean {
	if (jvm) {
		return Boolean(
			uploaded &&
			group.lastSeenRelease &&
			!group.topFrame?.original &&
			!uploaded.has(group.lastSeenRelease),
		);
	}
	const file = group.topFrame?.file ?? '';
	return Boolean(
		uploaded &&
		group.lastSeenRelease &&
		!isLibraryFile(file) &&
		isScriptFile(file) &&
		!uploaded.has(group.lastSeenRelease),
	);
}
