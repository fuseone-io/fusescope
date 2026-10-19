import { renderHook } from '@testing-library/react';
import { QueryData } from 'types/api/widgets/getQuery';

import { useGetGraphCustomSeries } from '../useGetGraphCustomSeries';

const seriesFor = (service: string): QueryData =>
	({
		metric: { 'service.name': service },
		queryName: 'A',
		legend: '',
		values: [[1000, '1']],
	}) as QueryData;

describe('useGetGraphCustomSeries', () => {
	it('gives series whose labels hash alike distinct colours', () => {
		const { result } = renderHook(() =>
			useGetGraphCustomSeries({ isDarkMode: true, colorMapping: {} }),
		);

		const strokes = result.current
			.getCustomSeries(['frontend', 'driver', 'redis-manual'].map(seriesFor))
			.slice(1)
			.map((s) => s.stroke);

		expect(new Set(strokes).size).toBe(3);
	});

	it('keeps a mapped colour', () => {
		const { result } = renderHook(() =>
			useGetGraphCustomSeries({
				isDarkMode: true,
				colorMapping: { '{service.name="driver"}': '#123456' },
			}),
		);

		const [, , driver] = result.current.getCustomSeries(
			['frontend', 'driver'].map(seriesFor),
		);

		expect(driver.stroke).toBe('#123456');
	});
});
