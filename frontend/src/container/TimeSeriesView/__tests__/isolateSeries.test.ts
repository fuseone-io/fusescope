import { isolateSeries } from '../utils';

describe('isolateSeries', () => {
	it('shows only the clicked series, starting from all visible', () => {
		expect(isolateSeries([], 2, 4)).toStrictEqual([false, false, true, false]);
	});

	it('shows every series again when the clicked one was alone', () => {
		expect(isolateSeries([false, false, true, false], 2, 4)).toStrictEqual([
			true,
			true,
			true,
			true,
		]);
	});

	it('moves the isolation to another series', () => {
		expect(isolateSeries([false, false, true, false], 1, 4)).toStrictEqual([
			false,
			true,
			false,
			false,
		]);
	});
});
