import {
	indexByLabels,
	seriesLabelsKey,
	toChartValue,
	valuesAt,
} from '../anomalySeries';

describe('seriesLabelsKey', () => {
	it('ignores label order', () => {
		expect(seriesLabelsKey({ a: '1', b: 'x' })).toBe(
			seriesLabelsKey({ b: 'x', a: '1' }),
		);
	});

	it.each([
		['separators inside a value', { a: 'x,b=y' }, { a: 'x', b: 'y' }],
		['a number against a string', { a: 1 }, { a: '1' }],
		['an empty set against an empty value', {}, { a: '' }],
	])('keeps %s apart', (_, left, right) => {
		expect(seriesLabelsKey(left)).not.toBe(seriesLabelsKey(right));
	});

	it('treats missing labels as the empty set', () => {
		expect(seriesLabelsKey(undefined)).toBe(seriesLabelsKey({}));
	});
});

describe('indexByLabels', () => {
	it('keeps the first series of a repeated label set', () => {
		const first = { labels: { a: '1' }, values: [] };
		const index = indexByLabels([
			first,
			{ labels: { a: '1' }, values: [{ timestamp: 1, value: 2 }] },
		]);
		expect(index.get(seriesLabelsKey({ a: '1' }))).toBe(first);
	});
});

describe('valuesAt', () => {
	it('returns null for timestamps the band lacks, and for no band', () => {
		const band = { values: [{ timestamp: 1000, value: 5 }] };
		expect(valuesAt([1000, 2000], band)).toStrictEqual([5, null]);
		expect(valuesAt([1000], undefined)).toStrictEqual([null]);
	});
});

describe('toChartValue', () => {
	it.each([
		['a number', 4, 4],
		['a numeric string', '2.5', 2.5],
		['an empty string', '', null],
		['null', null, null],
		['a non-numeric string', 'NaN', null],
	])('reads %s', (_, value, expected) => {
		expect(toChartValue(value)).toBe(expected);
	});
});
