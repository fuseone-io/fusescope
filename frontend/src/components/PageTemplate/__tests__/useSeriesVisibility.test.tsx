import { act, renderHook } from '@testing-library/react';
import uPlot from 'uplot';

import { useSeriesVisibility } from '../hooks/useSeriesVisibility';

const fakePlot = (labels: string[]): uPlot => {
	const series = [
		{ label: 'time' },
		...labels.map((label) => ({ label, show: true })),
	];
	return {
		series,
		setSeries: jest.fn((index: number, { show }: { show: boolean }) => {
			series[index] = { ...series[index], show };
		}),
	} as unknown as uPlot;
};

describe('useSeriesVisibility', () => {
	it('hides and shows a series by its label', () => {
		const plot = fakePlot(['frontend', 'payment']);
		const { result } = renderHook(() => useSeriesVisibility());

		act(() => result.current.plotRef(plot));
		act(() => result.current.toggle('payment'));

		expect(plot.setSeries).toHaveBeenLastCalledWith(2, { show: false });
		expect([...result.current.hidden]).toStrictEqual(['payment']);

		act(() => result.current.toggle('payment'));

		expect(plot.setSeries).toHaveBeenLastCalledWith(2, { show: true });
		expect(result.current.hidden.size).toBe(0);
	});

	it('ignores labels the chart does not have, and calls before the chart mounts', () => {
		const { result } = renderHook(() => useSeriesVisibility());

		act(() => result.current.toggle('frontend'));
		expect(result.current.hidden.size).toBe(0);

		const plot = fakePlot(['frontend']);
		act(() => result.current.plotRef(plot));
		act(() => result.current.toggle('missing'));

		expect(plot.setSeries).not.toHaveBeenCalled();
	});
});
