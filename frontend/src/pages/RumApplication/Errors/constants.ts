export const SEARCH_PARAM = 'q';
export const SOURCE_PARAM = 'source';
export const ROUTE_PARAM = 'route';
export const EVENT_PARAM = 'event';

/** `fusescope.rum.error.source` values the SDK sends. */
export const ERROR_SOURCES = [
	'onerror',
	'unhandledrejection',
	'manual',
] as const;

/** Groups fetched at once, by event count; the filters run on them. */
export const GROUP_LIMIT = 200;
