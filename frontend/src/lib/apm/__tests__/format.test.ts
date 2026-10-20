import {
	formatCount,
	formatLatencyMs,
	formatPercent,
	formatRate,
} from '../format';

describe('formatLatencyMs', () => {
	it.each([
		[1120, '1.12 s'],
		[540, '540 ms'],
		[3.4, '3.4 ms'],
		[0.25, '0.25 ms'],
		[0, '0 ms'],
		[undefined, '—'],
		[Number.NaN, '—'],
	])('%s ms reads %s', (value, expected) => {
		expect(formatLatencyMs(value)).toBe(expected);
	});
});

describe('formatRate', () => {
	it.each([
		[1.7, '1.70 req/s'],
		[14, '14.0 req/s'],
		[0.083, '0.08 req/s'],
		[undefined, '—'],
	])('%s reads %s', (value, expected) => {
		expect(formatRate(value)).toBe(expected);
	});
});

describe('formatPercent', () => {
	it.each([
		[100, '100%'],
		[7, '7.0%'],
		[0, '0.0%'],
		[18.509, '18.5%'],
		[undefined, '—'],
	])('%s reads %s', (value, expected) => {
		expect(formatPercent(value)).toBe(expected);
	});
});

describe('formatCount', () => {
	it('groups thousands', () => {
		expect(formatCount(6120)).toBe('6,120');
		expect(formatCount(undefined)).toBe('—');
	});
});
