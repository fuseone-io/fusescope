import {
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
