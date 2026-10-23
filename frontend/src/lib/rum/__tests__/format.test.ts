import {
	formatAgo,
	formatCountChange,
	formatPointChange,
	formatMs,
	formatSessionDuration,
	formatTimeOnView,
	plural,
	shortId,
} from '../format';

describe('formatAgo', () => {
	const now = Date.parse('2026-10-21T12:00:00Z');
	it.each([
		[now - 8_000, '8 s ago'],
		[now - 200, 'just now'],
		[now - 3 * 60_000, '3 min ago'],
		[now - 2 * 3_600_000, '2 h ago'],
		[now - 4 * 86_400_000, '4 d ago'],
		[undefined, '—'],
	])('%s', (at, text) => {
		expect(formatAgo(at, now)).toBe(text);
	});
});

describe('formatSessionDuration', () => {
	it.each([
		[48_000, '48s'],
		[372_000, '6m 12s'],
		[3_725_000, '1h 02m'],
		[0, '0s'],
		[undefined, '—'],
	])('%s', (ms, text) => {
		expect(formatSessionDuration(ms)).toBe(text);
	});
});

describe('formatCountChange', () => {
	it.each([
		[106, 100, '+6%'],
		[88, 100, '−12%'],
		[5, undefined, undefined],
		[5, 0, undefined],
	])('%d against %s', (current, previous, text) => {
		expect(formatCountChange(current, previous)).toBe(text);
	});
});

describe('formatPointChange', () => {
	it.each([
		[0.5, '+0.5 pp'],
		[-0.2, '−0.2 pp'],
		[undefined, undefined],
	])('%s', (delta, text) => {
		expect(formatPointChange(delta)).toBe(text);
	});
});

describe('plural', () => {
	it.each([
		[0, 'applications'],
		[1, 'application'],
		[3, 'applications'],
	])('names %i of them %s', (count, noun) => {
		expect(plural(count, 'application')).toBe(noun);
	});
});

describe('formatMs', () => {
	it.each([
		[645.9, '646 ms'],
		[1240, '1.24 s'],
		[0, '0 ms'],
		[undefined, '—'],
	])('%s', (ms, text) => {
		expect(formatMs(ms)).toBe(text);
	});
});

describe('formatTimeOnView', () => {
	it.each([
		[852.1, '852 ms'],
		[22_400, '22.4 s'],
		[64_000, '1m 4s'],
		[undefined, '—'],
	])('%s', (ms, text) => {
		expect(formatTimeOnView(ms)).toBe(text);
	});
});

describe('shortId', () => {
	it.each([
		['7f3ac9d04b1e4a6f9e2b5c8d1a07c21e', '7f3ac9…c21e'],
		['usr_9f2c88a141ab', 'usr_9f…41ab'],
		['alice', 'alice'],
	])('%s', (id, text) => {
		expect(shortId(id)).toBe(text);
	});
});
