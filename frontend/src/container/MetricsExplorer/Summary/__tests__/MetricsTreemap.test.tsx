// eslint-disable-next-line no-restricted-imports
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { MetricsexplorertypesTreemapModeDTO } from 'api/generated/services/fuseScope.schemas';
import store from 'store';

import MetricsTreemap from '../MetricsTreemap';

const mockData = [
	{
		metricName: 'Metric 1',
		percentage: 0.5,
		totalValue: 15,
	},
	{
		metricName: 'Metric 2',
		percentage: 0.6,
		totalValue: 10,
	},
];

describe('MetricsTreemap', () => {
	it('renders treemap with data correctly', () => {
		render(
			<MemoryRouter>
				<Provider store={store}>
					<MetricsTreemap
						isLoading={false}
						isError={false}
						data={{
							timeseries: [mockData[0]],
							samples: [mockData[1]],
						}}
						openMetricDetails={jest.fn()}
						viewType={MetricsexplorertypesTreemapModeDTO.samples}
						setHeatmapView={jest.fn()}
					/>
				</Provider>
			</MemoryRouter>,
		);

		expect(screen.getByText('Proportion view')).toBeInTheDocument();
		const tile = screen.getByTestId('metrics-treemap-tile-Metric 2');
		expect(tile).toHaveTextContent('Metric 2');
		expect(tile).toHaveTextContent('0.60%');
	});

	it('shows loading state', () => {
		render(
			<MemoryRouter>
				<Provider store={store}>
					<MetricsTreemap
						isLoading
						isError={false}
						data={{
							timeseries: [mockData[0]],
							samples: [mockData[1]],
						}}
						openMetricDetails={jest.fn()}
						viewType={MetricsexplorertypesTreemapModeDTO.samples}
						setHeatmapView={jest.fn()}
					/>
				</Provider>
			</MemoryRouter>,
		);

		expect(
			screen.getByTestId('metrics-treemap-loading-state'),
		).toBeInTheDocument();
	});

	it('shows error state', () => {
		render(
			<MemoryRouter>
				<Provider store={store}>
					<MetricsTreemap
						isLoading={false}
						isError
						data={{
							timeseries: [mockData[0]],
							samples: [mockData[1]],
						}}
						openMetricDetails={jest.fn()}
						viewType={MetricsexplorertypesTreemapModeDTO.samples}
						setHeatmapView={jest.fn()}
					/>
				</Provider>
			</MemoryRouter>,
		);

		expect(screen.getByTestId('metrics-treemap-error-state')).toBeInTheDocument();
		expect(
			screen.getByText(
				'Error fetching metrics. If the problem persists, please contact support.',
			),
		).toBeInTheDocument();
	});

	it('shows empty state when no data', () => {
		render(
			<MemoryRouter>
				<Provider store={store}>
					<MetricsTreemap
						isLoading={false}
						isError={false}
						data={undefined}
						openMetricDetails={jest.fn()}
						viewType={MetricsexplorertypesTreemapModeDTO.samples}
						setHeatmapView={jest.fn()}
					/>
				</Provider>
			</MemoryRouter>,
		);

		expect(screen.getByTestId('metrics-treemap-empty-state')).toBeInTheDocument();
		expect(screen.getByText('No metrics found')).toBeInTheDocument();
	});

	it('opens the metric details from a tile', () => {
		const openMetricDetails = jest.fn();
		render(
			<MetricsTreemap
				isLoading={false}
				isError={false}
				data={{ timeseries: [], samples: mockData }}
				openMetricDetails={openMetricDetails}
				viewType={MetricsexplorertypesTreemapModeDTO.samples}
				setHeatmapView={jest.fn()}
			/>,
		);

		fireEvent.click(screen.getByTestId('metrics-treemap-tile-Metric 1'));

		expect(openMetricDetails).toHaveBeenCalledWith(
			'Metric 1',
			'treemap',
			expect.any(Object),
		);
	});

	it('sizes tiles by samples or time series from the segmented toggle', () => {
		const setHeatmapView = jest.fn();
		render(
			<MetricsTreemap
				isLoading={false}
				isError={false}
				data={{ timeseries: [], samples: mockData }}
				openMetricDetails={jest.fn()}
				viewType={MetricsexplorertypesTreemapModeDTO.samples}
				setHeatmapView={setHeatmapView}
			/>,
		);

		expect(screen.getByRole('button', { name: 'Samples' })).toHaveAttribute(
			'aria-pressed',
			'true',
		);
		fireEvent.click(screen.getByRole('button', { name: 'Time series' }));

		expect(setHeatmapView).toHaveBeenCalledWith(
			MetricsexplorertypesTreemapModeDTO.timeseries,
		);
	});

	it('collapses and reopens the proportion view', () => {
		render(
			<MetricsTreemap
				isLoading={false}
				isError={false}
				data={{ timeseries: [], samples: mockData }}
				openMetricDetails={jest.fn()}
				viewType={MetricsexplorertypesTreemapModeDTO.samples}
				setHeatmapView={jest.fn()}
			/>,
		);

		const toggle = screen.getByRole('button', { name: 'Toggle proportion view' });
		expect(toggle).toHaveAttribute('aria-expanded', 'true');

		fireEvent.click(toggle);

		expect(toggle).toHaveAttribute('aria-expanded', 'false');
		expect(
			screen.queryByTestId('metrics-treemap-tile-Metric 1'),
		).not.toBeInTheDocument();

		fireEvent.click(toggle);

		expect(
			screen.getByTestId('metrics-treemap-tile-Metric 1'),
		).toBeInTheDocument();
	});
});
