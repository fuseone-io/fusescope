import { QueryData } from 'types/api/widgets/getQuery';

import { recordsTimePhrase, sumSeriesTotal } from '../recordCount';

const series = (values: [number, string][]): QueryData =>
	({ metric: {}, queryName: 'A', legend: '', values }) as QueryData;

describe('sumSeriesTotal', () => {
	it('adds every bucket of every series', () => {
		expect(
			sumSeriesTotal([
				series([
					[1, '3'],
					[2, '4'],
				]),
				series([[1, '10']]),
			]),
		).toBe(17);
	});

	it('is zero without series', () => {
		expect(sumSeriesTotal([])).toBe(0);
	});
});

describe('recordsTimePhrase', () => {
	const start = '19/10/2026 14:00:00';
	const end = '19/10/2026 14:30:00';

	it.each([
		['30m', 'in the last 30 minutes'],
		['1h', 'in the last 1 hour'],
		['1month', 'in the last 1 month'],
	])('names the relative range %s', (time, phrase) => {
		expect(recordsTimePhrase(time, start, end)).toBe(phrase);
	});

	it('names a custom range by its bounds', () => {
		expect(recordsTimePhrase('custom', start, end)).toBe(
			'between 19/10/2026 14:00:00 and 19/10/2026 14:30:00',
		);
	});
});
