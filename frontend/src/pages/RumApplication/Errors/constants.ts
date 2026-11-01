export const SEARCH_PARAM = 'q';
export const SOURCE_PARAM = 'source';
export const ROUTE_PARAM = 'route';
export const EVENT_PARAM = 'event';

/** `fusescope.rum.error.source` values the browser SDK sends. */
export const WEB_ERROR_SOURCES = [
	'onerror',
	'unhandledrejection',
	'manual',
] as const;

/** `fusescope.rum.error.source` values the Android SDK and the gateway send. */
export const ANDROID_ERROR_SOURCES = [
	'crash',
	'anr',
	'native',
	'manual',
] as const;

export const ERROR_SOURCES = [
	'onerror',
	'unhandledrejection',
	'manual',
	'crash',
	'anr',
	'native',
] as const;

/** Groups fetched at once, by event count; the filters run on them. */
export const GROUP_LIMIT = 200;
