import { errorKind } from '../errorKind';

describe('errorKind', () => {
	it.each([
		[{ source: 'anr', type: 'ANR' }, 'anr'],
		[{ source: '', type: 'ANR' }, 'anr'],
		[{ source: 'crash', type: 'java.lang.IllegalStateException' }, 'crash'],
		[{ source: 'onerror', type: 'TypeError' }, undefined],
	])('%o is %s', (group, expected) => {
		expect(errorKind(group)).toBe(expected);
	});
});
