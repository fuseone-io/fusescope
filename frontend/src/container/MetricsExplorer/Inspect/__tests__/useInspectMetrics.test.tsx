import { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from 'react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { inspectMetrics } from 'api/generated/services/metrics';
import { REACT_QUERY_KEY } from 'constants/reactQueryKeys';

import { SpaceAggregationOptions, TimeAggregationOptions } from '../types';
import { useInspectMetrics } from '../useInspectMetrics';

jest.mock('api/generated/services/metrics', () => ({
	inspectMetrics: jest.fn(),
}));

const MINUTE = 60_000;

const rawSeries = (host: string, offset: number): unknown => ({
	labels: [
		{ key: { name: 'service' }, value: 'api' },
		{ key: { name: 'host' }, value: host },
	],
	values: [0, 1, 2].map((i) => ({
		timestamp: 100 * MINUTE + i * MINUTE + 3_000,
		value: offset + i,
	})),
});

describe('useInspectMetrics', () => {
	beforeEach(() => {
		let call = 0;
		jest.mocked(inspectMetrics).mockImplementation(async () => {
			call += 1;
			return {
				status: 'success',
				data: { series: [rawSeries('a', 10 * call), rawSeries('b', 20 * call)] },
			} as Awaited<ReturnType<typeof inspectMetrics>>;
		});
	});

	it('keeps the aggregated series after the applied query refetches', async () => {
		const queryClient = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		const wrapper = ({ children }: { children: ReactNode }): JSX.Element => (
			<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
		);
		const { result } = renderHook(() => useInspectMetrics('heap'), { wrapper });
		await waitFor(() =>
			expect(result.current.inspectMetricsTimeSeries).toHaveLength(2),
		);

		act(() => {
			const dispatch = result.current.dispatchMetricInspectionOptions;
			dispatch({
				type: 'SET_TIME_AGGREGATION_OPTION',
				payload: TimeAggregationOptions.LATEST,
			});
			dispatch({ type: 'SET_TIME_AGGREGATION_INTERVAL', payload: 60 });
			dispatch({
				type: 'SET_SPACE_AGGREGATION_OPTION',
				payload: SpaceAggregationOptions.SUM_BY,
			});
			dispatch({ type: 'SET_SPACE_AGGREGATION_LABELS', payload: ['service'] });
			dispatch({ type: 'APPLY_METRIC_INSPECTION_OPTIONS' });
		});
		await act(() =>
			queryClient.invalidateQueries([REACT_QUERY_KEY.GET_INSPECT_METRICS_DETAILS]),
		);

		await waitFor(() =>
			expect(result.current.aggregatedTimeSeries).toHaveLength(1),
		);
		expect(result.current.aggregatedTimeSeries[0].values).toStrictEqual([
			{ timestamp: 100 * MINUTE, value: '60' },
			{ timestamp: 101 * MINUTE, value: '62' },
			{ timestamp: 102 * MINUTE, value: '64' },
		]);
		expect([...result.current.spaceAggregatedSeriesMap.keys()]).toStrictEqual([
			'service:api',
		]);
	});
});
