// eslint-disable-next-line no-restricted-imports
import { Provider } from 'react-redux';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MetrictypesTypeDTO } from 'api/generated/services/fuseScope.schemas';
import store from 'store';
import { AlignedData } from 'uplot';

import GraphView from '../GraphView';
import { InspectMetricsSeries } from '../types';
import {
	InspectionStep,
	SpaceAggregationOptions,
	TimeAggregationOptions,
} from '../types';

const mockResizeObserver = jest.fn();
mockResizeObserver.mockImplementation(() => ({
	observe: (): void => undefined,
	unobserve: (): void => undefined,
	disconnect: (): void => undefined,
}));
window.ResizeObserver = mockResizeObserver;

describe('GraphView', () => {
	const mockTimeSeries: InspectMetricsSeries[] = [
		{
			strokeColor: '#000',
			title: 'Series 1',
			values: [
				{ timestamp: 1234567890000, value: '10' },
				{ timestamp: 1234567891000, value: '20' },
			],
			labels: { label1: 'value1' },
		},
	];

	const defaultProps = {
		inspectMetricsTimeSeries: mockTimeSeries,
		formattedInspectMetricsTimeSeries: [
			[1, 2],
			[1, 2],
		] as AlignedData,
		metricUnit: '',
		metricName: 'test_metric',
		metricType: MetrictypesTypeDTO.gauge,
		spaceAggregationSeriesMap: new Map(),
		inspectionStep: InspectionStep.COMPLETED,
		setPopoverOptions: jest.fn(),
		popoverOptions: null,
		setShowExpandedView: jest.fn(),
		setExpandedViewOptions: jest.fn(),
		resetInspection: jest.fn(),
		showExpandedView: false,
		metricInspectionAppliedOptions: {
			timeAggregationInterval: 60,
			spaceAggregationOption: SpaceAggregationOptions.MAX_BY,
			spaceAggregationLabels: ['host_name'],
			timeAggregationOption: TimeAggregationOptions.MAX,
			filterExpression: '',
		},
		isInspectMetricsRefetching: false,
	};

	beforeEach(() => {
		jest.clearAllMocks();
	});

	it('renders graph view by default', () => {
		render(
			<Provider store={store}>
				<GraphView {...defaultProps} />
			</Provider>,
		);
		expect(screen.getByRole('button', { name: 'Graph' })).toHaveAttribute(
			'aria-pressed',
			'true',
		);
		expect(screen.getByRole('button', { name: 'Table' })).toHaveAttribute(
			'aria-pressed',
			'false',
		);
	});

	it('switches between graph and table view', async () => {
		render(
			<Provider store={store}>
				<GraphView {...defaultProps} />
			</Provider>,
		);

		await userEvent.click(screen.getByRole('button', { name: 'Table' }));

		expect(screen.getByRole('button', { name: 'Table' })).toHaveAttribute(
			'aria-pressed',
			'true',
		);
	});

	it('renders the number of series', () => {
		render(
			<Provider store={store}>
				<GraphView {...defaultProps} />
			</Provider>,
		);
		expect(screen.getByText('1 time series')).toBeInTheDocument();
	});
});
