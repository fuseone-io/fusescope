import {
	absoluteDelta,
	changeRatio,
	deltaTone,
	percentPointDelta,
	relativeDelta,
} from '../delta';

describe('changeRatio', () => {
	it.each([
		[2, 1, 2],
		[0, 0, 1],
		[3, 0, Infinity],
		[0, 4, 0],
	])('%d against %d is %d', (current, previous, expected) => {
		expect(changeRatio(current, previous)).toBe(expected);
	});
});

describe('relativeDelta', () => {
	it.each([
		[1.7, 1.31, '+30%'],
		[1.0, 1.25, '−20%'],
		[1120, 540, '↑2.1×'],
		[5, 0, '↑new'],
		[1, 1, 'no change'],
		[0, 0, 'no change'],
		[100.2, 100, 'no change'],
	])('%d against %d reads %s', (current, previous, expected) => {
		expect(relativeDelta(current, previous)).toBe(expected);
	});
});

describe('percentPointDelta', () => {
	it.each([
		[7.0, 6.8, '+0.2 pp'],
		[6.0, 7.5, '−1.5 pp'],
		[18.5, 6.2, '↑3.0×'],
		[0, 0, 'no change'],
		[3, 0, '+3.0 pp'],
		[100, 100, 'no change'],
	])('%d%% against %d%% reads %s', (current, previous, expected) => {
		expect(percentPointDelta(current, previous)).toBe(expected);
	});
});

describe('absoluteDelta', () => {
	it.each([
		[0.81, 0.9, '−0.09'],
		[0.95, 0.9, '+0.05'],
		[0.9, 0.9, 'no change'],
	])('%d against %d reads %s', (current, previous, expected) => {
		expect(absoluteDelta(current, previous)).toBe(expected);
	});
});

describe('deltaTone', () => {
	it.each([
		['higher-is-bad', 1120, 540, 'bad'],
		['higher-is-bad', 480, 540, 'good'],
		['higher-is-bad', 550, 540, 'neutral'],
		['lower-is-bad', 0.81, 0.9, 'bad'],
		['lower-is-bad', 0.99, 0.9, 'neutral'],
		['neutral', 10, 1, 'neutral'],
		['higher-is-bad', 3, 0, 'bad'],
		['higher-is-bad', 0, 0, 'neutral'],
	] as const)('%s: %d against %d is %s', (kind, current, previous, expected) => {
		expect(deltaTone(kind, current, previous)).toBe(expected);
	});
});
