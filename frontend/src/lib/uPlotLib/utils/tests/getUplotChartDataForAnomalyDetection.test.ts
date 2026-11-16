import { MetricRangePayloadProps } from 'types/api/metrics/getQueryRange';

import { getUplotChartDataForAnomalyDetection } from '../getUplotChartData';

const seriesFor = (service: string): Record<string, unknown> => ({
	labels: { 'service.name': service },
	values: [{ timestamp: 1000, value: 1 }],
});

describe('getUplotChartDataForAnomalyDetection', () => {
	it('gives series whose labels hash alike distinct colours', () => {
		const services = ['frontend', 'driver', 'redis-manual'];
		const response = {
			data: {
				newResult: {
					data: {
						result: [
							{
								queryName: 'A',
								legend: '',
								series: services.map(seriesFor),
								predictedSeries: services.map(seriesFor),
								upperBoundSeries: services.map(seriesFor),
								lowerBoundSeries: services.map(seriesFor),
							},
						],
					},
				},
			},
		} as unknown as MetricRangePayloadProps;

		const data = getUplotChartDataForAnomalyDetection(response, true);

		expect(new Set(Object.values(data).map((d) => d.color)).size).toBe(3);
	});
});

const point = (timestamp: number, value: number): Record<string, unknown> => ({
	timestamp,
	value,
});

const response = (result: Record<string, unknown>): MetricRangePayloadProps =>
	({
		data: { newResult: { data: { result: [result] } } },
	}) as unknown as MetricRangePayloadProps;

describe('getUplotChartDataForAnomalyDetection alignment', () => {
	it('projects the bands onto the series timestamps, null where a point is missing', () => {
		const labels = { service: 'api' };
		const data = getUplotChartDataForAnomalyDetection(
			response({
				queryName: 'A',
				legend: '',
				series: [
					{ labels, values: [point(1000, 10), point(2000, 20), point(3000, 30)] },
				],
				predictedSeries: [{ labels, values: [point(1000, 11), point(3000, 31)] }],
				upperBoundSeries: [{ labels, values: [point(1000, 12), point(3000, 32)] }],
				lowerBoundSeries: [{ labels, values: [point(1000, 9), point(3000, 29)] }],
			}),
			false,
		);
		const [timestamps, values, predicted, upper, lower] =
			Object.values(data)[0].data;
		expect(timestamps).toStrictEqual([1, 2, 3]);
		expect(values).toStrictEqual([10, 20, 30]);
		expect(predicted).toStrictEqual([11, null, 31]);
		expect(upper).toStrictEqual([12, null, 32]);
		expect(lower).toStrictEqual([9, null, 29]);
	});

	it('leaves a leading partial point without a band', () => {
		const labels = { service: 'api' };
		const data = getUplotChartDataForAnomalyDetection(
			response({
				queryName: 'A',
				legend: '',
				series: [
					{
						labels,
						values: [{ ...point(1000, 5), partial: true }, point(2000, 20)],
					},
				],
				predictedSeries: [{ labels, values: [point(2000, 21)] }],
				upperBoundSeries: [{ labels, values: [point(2000, 22)] }],
				lowerBoundSeries: [{ labels, values: [point(2000, 19)] }],
			}),
			false,
		);
		expect(Object.values(data)[0].data[2]).toStrictEqual([null, 21]);
	});

	it('matches bands to series by labels, not position', () => {
		const api = { service: 'api' };
		const web = { service: 'web' };
		const data = getUplotChartDataForAnomalyDetection(
			response({
				queryName: 'A',
				legend: '',
				series: [
					{ labels: api, values: [point(1000, 1)] },
					{ labels: web, values: [point(1000, 100)] },
				],
				predictedSeries: [
					{ labels: web, values: [point(1000, 101)] },
					{ labels: api, values: [point(1000, 2)] },
				],
				upperBoundSeries: [],
				lowerBoundSeries: [],
			}),
			false,
		);
		const predictedByLegend = Object.fromEntries(
			Object.values(data).map((entry) => [entry.legendLabel, entry.data[2]]),
		);
		expect(Object.values(predictedByLegend)).toStrictEqual(
			expect.arrayContaining([[2], [101]]),
		);
		const byFirstValue = Object.fromEntries(
			Object.values(data).map((entry) => [entry.data[1][0], entry.data[2][0]]),
		);
		expect(byFirstValue).toStrictEqual({ 1: 2, 100: 101 });
	});
});
