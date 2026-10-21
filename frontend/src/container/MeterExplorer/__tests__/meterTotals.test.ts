import { MetricRangePayloadProps } from 'types/api/metrics/getQueryRange';
import { QueryData } from 'types/api/widgets/getQuery';

import { seriesTotals, summarize } from '../meterTotals';

const response = (result: Partial<QueryData>[]): MetricRangePayloadProps =>
	({ data: { result, resultType: '', newResult: {} } }) as never;

const series = (
	label: string,
	values: [number, string][],
): Partial<QueryData> => ({
	queryName: 'A',
	metric: { 'service.name': label },
	legend: '',
	values,
});

describe('summarize', () => {
	it('totals and peaks every bar of every series', () => {
		expect(
			summarize(
				response([
					series('frontend', [
						[1, '10'],
						[2, '30'],
					]),
					series('payment', [
						[1, '5'],
						[2, '5'],
					]),
				]),
			),
		).toStrictEqual({ total: 50, peak: 35, hasData: true });
	});

	it('skips values that are not numbers', () => {
		expect(
			summarize(
				response([
					series('frontend', [
						[1, 'NaN'],
						[2, '4'],
					]),
				]),
			),
		).toStrictEqual({ total: 4, peak: 4, hasData: true });
	});

	it.each([
		['no response', undefined],
		['no series', response([])],
		['only empty series', response([series('frontend', [])])],
	])('has no data with %s', (_, payload) => {
		expect(summarize(payload)).toStrictEqual({
			total: 0,
			peak: 0,
			hasData: false,
		});
	});
});

describe('seriesTotals', () => {
	it('sums each series on its own, in response order', () => {
		expect(
			seriesTotals(
				response([
					series('frontend', [
						[1, '10'],
						[2, '30'],
					]),
					series('payment', [[1, '5']]),
				]),
			),
		).toStrictEqual([40, 5]);
	});
});
