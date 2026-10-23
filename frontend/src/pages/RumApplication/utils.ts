import { matchPath } from 'react-router-dom';
import ROUTES from 'constants/routes';
import { allOf, inList, quote } from 'lib/apm/filters';
import { exceptionEventsFilter, RUM_ATTRIBUTES } from 'lib/rum/attributes';

import {
	ApplicationTab,
	CARRIED_PARAMS,
	ERRORS_TAB,
	OVERVIEW_TAB,
	SESSIONS_TAB,
	VIEWS_TAB,
} from './constants';

/** The application's exceptions in the logs explorer, or one error group's. */
export function errorLogsFilter(
	filter: string,
	error?: { type: string; message: string },
): string {
	if (!error) {
		return allOf(filter, exceptionEventsFilter);
	}
	return allOf(
		filter,
		exceptionEventsFilter,
		`${RUM_ATTRIBUTES.exceptionType} = ${quote(error.type)}`,
		error.message
			? `${RUM_ATTRIBUTES.exceptionMessage} = ${quote(error.message)}`
			: '',
	);
}

export const sessionsTracesFilter = (
	filter: string,
	sessionIds: string[],
): string =>
	allOf(filter, `${RUM_ATTRIBUTES.sessionId} IN ${inList(sessionIds)}`);

/** "7f3ac9…c21e". */
export const shortSessionId = (id: string): string =>
	id.length > 14 ? `${id.slice(0, 6)}…${id.slice(-4)}` : id;

export function applicationTab(pathname: string): ApplicationTab {
	const matches = (path: string): boolean =>
		matchPath(pathname, { path }) !== null;
	if (matches(ROUTES.RUM_APPLICATION_SESSIONS)) {
		return SESSIONS_TAB;
	}
	if (matches(ROUTES.RUM_APPLICATION_ERRORS)) {
		return ERRORS_TAB;
	}
	return matches(ROUTES.RUM_APPLICATION_VIEWS) ? VIEWS_TAB : OVERVIEW_TAB;
}

/** The part of `search` that another tab keeps. */
export function carriedSearch(search: string): string {
	const current = new URLSearchParams(search);
	const kept = new URLSearchParams();
	CARRIED_PARAMS.forEach((param) => {
		const value = current.get(param);
		if (value) {
			kept.set(param, value);
		}
	});
	const query = kept.toString();
	return query ? `?${query}` : '';
}

/** The one-item view open inside a tab, whose toolbar is a way back. */
export function detailView(
	sessionId: string | undefined,
	fingerprint: string | undefined,
): 'session' | 'error' | undefined {
	if (sessionId) {
		return 'session';
	}
	return fingerprint ? 'error' : undefined;
}

/** `search` without the open item's own params, for the way back to its list. */
export function backSearch(search: string): string {
	const params = new URLSearchParams(search);
	params.delete('event');
	const query = params.toString();
	return query ? `?${query}` : '';
}

const RECENT_ERRORS = 5;

export function recentErrorGroups<T extends { lastSeenAt: string }>(
	groups: T[],
): T[] {
	return [...groups]
		.sort((a, b) => Date.parse(b.lastSeenAt) - Date.parse(a.lastSeenAt))
		.slice(0, RECENT_ERRORS);
}
