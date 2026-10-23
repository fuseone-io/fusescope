import { matchPath } from 'react-router-dom';
import ROUTES from 'constants/routes';
import { allOf, inList, quote } from 'lib/apm/filters';
import { exceptionEventsFilter, RUM_ATTRIBUTES } from 'lib/rum/attributes';
import { ErrorGroup } from 'lib/rum/overviewTypes';

import {
	ApplicationTab,
	CARRIED_PARAMS,
	OVERVIEW_TAB,
	SESSIONS_TAB,
	VIEWS_TAB,
} from './constants';

/** The application's exceptions in the logs explorer, or one error group's. */
export function errorLogsFilter(filter: string, error?: ErrorGroup): string {
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
