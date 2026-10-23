import {
	applicationTab,
	carriedSearch,
	errorLogsFilter,
	sessionsTracesFilter,
	shortSessionId,
} from '../utils';

const APP = "fusescope.rum.application.id = 'app-1'";

describe('errorLogsFilter', () => {
	it('opens all exceptions of the application', () => {
		expect(errorLogsFilter(APP)).toBe(
			`${APP} AND attribute.event.name = 'exception'`,
		);
	});

	it('narrows to one error group, quotes escaped', () => {
		expect(
			errorLogsFilter(APP, {
				type: 'TypeError',
				message: "Cannot read properties of undefined (reading 'price')",
				route: '/product/:id',
				events: 1,
				sessions: 1,
			}),
		).toBe(
			`${APP} AND attribute.event.name = 'exception' AND exception.type = 'TypeError' AND exception.message = 'Cannot read properties of undefined (reading \\'price\\')'`,
		);
	});

	it('leaves the message out when it is empty', () => {
		expect(
			errorLogsFilter(APP, {
				type: 'Error',
				message: '',
				route: '',
				events: 1,
				sessions: 1,
			}),
		).toBe(
			`${APP} AND attribute.event.name = 'exception' AND exception.type = 'Error'`,
		);
	});
});

describe('sessionsTracesFilter', () => {
	it('lists the sessions', () => {
		expect(sessionsTracesFilter(APP, ['s1', 's2'])).toBe(
			`${APP} AND session.id IN ['s1', 's2']`,
		);
	});
});

describe('shortSessionId', () => {
	it.each([
		['7f3ac9d04b1e4a6f9e2b5c8d1a07c21e', '7f3ac9…c21e'],
		['short-id', 'short-id'],
	])('%s', (id, text) => {
		expect(shortSessionId(id)).toBe(text);
	});
});

describe('applicationTab', () => {
	it.each([
		['/frontend/applications/app-1', 'overview'],
		['/frontend/applications/app-1/views', 'views'],
		['/frontend/applications/app-1/sessions', 'sessions'],
		['/frontend/applications/app-1/sessions/abc', 'sessions'],
	])('%s', (pathname, tab) => {
		expect(applicationTab(pathname)).toBe(tab);
	});
});

describe('carriedSearch', () => {
	it('keeps the release and time range, drops tab state', () => {
		expect(
			carriedSearch('?release=1.8.0&route=%2Fcart&relativeTime=1h&page=2'),
		).toBe('?release=1.8.0&relativeTime=1h');
	});

	it('is empty without them', () => {
		expect(carriedSearch('?browser=Chrome')).toBe('');
	});
});
