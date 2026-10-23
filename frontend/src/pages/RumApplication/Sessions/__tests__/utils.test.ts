import {
	durationRangeOf,
	parseSessionFilters,
	sessionListParams,
	writeSessionFilters,
} from '../utils';

describe('parseSessionFilters', () => {
	it('defaults to every session, first page', () => {
		expect(parseSessionFilters('')).toStrictEqual({
			browser: '',
			route: '',
			userId: '',
			hasError: false,
			minDurationMs: undefined,
			maxDurationMs: undefined,
			page: 1,
			pageSize: 50,
		});
	});

	it('reads every filter', () => {
		expect(
			parseSessionFilters(
				'?browser=Chrome&route=%2Fcart&userId=u1&hasError=true&minDuration=60000&maxDuration=300000&page=3&pageSize=20',
			),
		).toStrictEqual({
			browser: 'Chrome',
			route: '/cart',
			userId: 'u1',
			hasError: true,
			minDurationMs: 60000,
			maxDurationMs: 300000,
			page: 3,
			pageSize: 20,
		});
	});

	it.each([
		['?page=0', 1],
		['?page=abc', 1],
		['?page=-2', 1],
	])('ignores a bad page in %s', (search, page) => {
		expect(parseSessionFilters(search).page).toBe(page);
	});

	it('ignores a bad duration and page size', () => {
		const filters = parseSessionFilters('?minDuration=x&pageSize=7');
		expect(filters.minDurationMs).toBeUndefined();
		expect(filters.pageSize).toBe(50);
	});
});

describe('writeSessionFilters', () => {
	it('keeps other params, drops defaults and goes back to the first page', () => {
		expect(
			writeSessionFilters('?release=1.8.0&page=4&relativeTime=1h', {
				browser: 'Safari',
				hasError: true,
			}),
		).toBe('?release=1.8.0&relativeTime=1h&browser=Safari&hasError=true');
	});

	it('clears a filter', () => {
		expect(
			writeSessionFilters('?browser=Safari&route=%2F', { browser: '' }),
		).toBe('?route=%2F');
	});

	it('writes a page and a duration range', () => {
		expect(
			writeSessionFilters('', {
				minDurationMs: 60000,
				maxDurationMs: undefined,
				page: 2,
			}),
		).toBe('?minDuration=60000&page=2');
	});

	it('round-trips', () => {
		const search = writeSessionFilters('', {
			route: '/product/:id',
			userId: 'u 1',
			maxDurationMs: 10000,
			pageSize: 100,
		});
		expect(parseSessionFilters(search)).toMatchObject({
			route: '/product/:id',
			userId: 'u 1',
			maxDurationMs: 10000,
			pageSize: 100,
		});
	});
});

describe('sessionListParams', () => {
	it('maps filters to the API, with the page as an offset', () => {
		expect(
			sessionListParams(
				parseSessionFilters('?browser=Chrome&hasError=true&page=3&pageSize=20'),
				{ start: 1, end: 2 },
				'1.8.0',
			),
		).toStrictEqual({
			start: 1,
			end: 2,
			release: '1.8.0',
			browser: 'Chrome',
			hasError: true,
			limit: 20,
			offset: 40,
		});
	});

	it('sends only what is set', () => {
		expect(
			sessionListParams(parseSessionFilters('?minDuration=1000'), {
				start: 1,
				end: 2,
			}),
		).toStrictEqual({
			start: 1,
			end: 2,
			minDurationMs: 1000,
			limit: 50,
			offset: 0,
		});
	});
});

describe('durationRangeOf', () => {
	it.each([
		[undefined, undefined, 'any'],
		[60000, undefined, 'gte1m'],
		[undefined, 10000, 'lt10s'],
		[1234, undefined, 'custom'],
	])('%s – %s', (min, max, range) => {
		expect(durationRangeOf(min, max)).toBe(range);
	});
});
