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
