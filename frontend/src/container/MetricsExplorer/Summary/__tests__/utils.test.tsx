import { render } from '@testing-library/react';
import { MetrictypesTypeDTO } from 'api/generated/services/fuseScope.schemas';
import { getUniversalNameFromMetricUnit } from 'components/YAxisUnitSelector/utils';

import { TreemapViewType } from '../types';
import { formatDataForMetricsTable } from '../utils';

describe('formatDataForMetricsTable', () => {
	it('should format metrics data correctly', () => {
		const mockData = [
			{
				metricName: 'test_metric',
				description: 'Test description',
				type: MetrictypesTypeDTO.gauge,
				unit: 'bytes',
				samples: 1000,
				timeseries: 2000,
				lastReceived: '2023-01-01T00:00:00Z',
			},
		];

		const result = formatDataForMetricsTable(mockData);

		expect(result).toHaveLength(1);
		expect(result[0].key).toBe('test_metric');

		// Verify metric name rendering
		const metricNameElement = result[0].metric_name as JSX.Element;
		const { container: metricNameWrapper } = render(metricNameElement);
		expect(metricNameWrapper.textContent).toBe('test_metric');

		// Verify description rendering
		const descriptionElement = result[0].description as JSX.Element;
		const { container: descriptionWrapper } = render(descriptionElement);
		expect(descriptionWrapper.textContent).toBe('Test description');
		expect(descriptionWrapper.querySelector('.description-tooltip')).toBeTruthy();

		// Verify metric type rendering
		const metricTypeElement = result[0].metric_type as JSX.Element;
		const { container: metricTypeWrapper } = render(metricTypeElement);
		expect(metricTypeWrapper.querySelector('.metric-type-renderer')).toBeTruthy();

		// Verify unit rendering
		const unitElement = result[0].unit as JSX.Element;
		const { container: unitWrapper } = render(unitElement);
		expect(unitWrapper.textContent).toBe(getUniversalNameFromMetricUnit('bytes'));

		// Verify samples rendering
		const samplesElement = result[0][TreemapViewType.SAMPLES] as JSX.Element;
		const { container: samplesWrapper } = render(samplesElement);
		expect(samplesWrapper.textContent).toBe('1K+');

		// Verify timeseries rendering
		const timeseriesElement = result[0][
			TreemapViewType.TIMESERIES
		] as JSX.Element;
		const { container: timeseriesWrapper } = render(timeseriesElement);
		expect(timeseriesWrapper.textContent).toBe('2K+');
	});

	it('should handle empty/null values', () => {
		const mockData = [
			{
				metricName: '',
				description: '',
				type: MetrictypesTypeDTO.gauge,
				unit: '',
				samples: 0,
				timeseries: 0,
				lastReceived: '2023-01-01T00:00:00Z',
			},
		];

		const result = formatDataForMetricsTable(mockData);

		// Verify empty metric name rendering
		const metricNameElement = result[0].metric_name as JSX.Element;
		const { container: metricNameWrapper } = render(metricNameElement);
		expect(metricNameWrapper.textContent).toBe('-');

		// Verify null description rendering
		const descriptionElement = result[0].description as JSX.Element;
		const { container: descriptionWrapper } = render(descriptionElement);
		expect(descriptionWrapper.textContent).toBe('-');

		// Verify null unit rendering
		const unitElement = result[0].unit as JSX.Element;
		const { container: unitWrapper } = render(unitElement);
		expect(unitWrapper.textContent).toBe('-');

		// Verify zero samples rendering
		const samplesElement = result[0][TreemapViewType.SAMPLES] as JSX.Element;
		const { container: samplesWrapper } = render(samplesElement);
		expect(samplesWrapper.textContent).toBe('-');

		// Verify zero timeseries rendering
		const timeseriesElement = result[0][
			TreemapViewType.TIMESERIES
		] as JSX.Element;
		const { container: timeseriesWrapper } = render(timeseriesElement);
		expect(timeseriesWrapper.textContent).toBe('-');
	});
});
