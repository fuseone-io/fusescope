export const OVERVIEW_TAB = 'overview';
export const VIEWS_TAB = 'views';
export const ERRORS_TAB = 'errors';
export const SESSIONS_TAB = 'sessions';

export type ApplicationTab =
	| typeof OVERVIEW_TAB
	| typeof VIEWS_TAB
	| typeof ERRORS_TAB
	| typeof SESSIONS_TAB;

export const RELEASE_PARAM = 'release';

/** Query params that hold across tabs: the release and the global time range. */
export const CARRIED_PARAMS = [
	RELEASE_PARAM,
	'relativeTime',
	'startTime',
	'endTime',
];

/** Requests at least this long are drawn as slow. */
export const SLOW_REQUEST_MS = 800;
