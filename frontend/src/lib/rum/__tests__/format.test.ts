import {
	formatAgo,
	formatCountChange,
	formatPointChange,
	formatSessionDuration,
	plural,
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
