import { render, screen } from '@testing-library/react';
import * as metricsExplorerHooks from 'api/generated/services/metrics';
import { MetrictypesTypeDTO } from 'api/generated/services/fuseScope.schemas';
import { userEvent } from 'tests/test-utils';

import * as useHandleExplorerTabChangeHooks from 'hooks/useHandleExplorerTabChange';

import ROUTES from '../../../../constants/routes';
import AllAttributes from '../AllAttributes';
import { AllAttributesValue } from '../AllAttributesValue';
import { getMockMetricAttributesData, MOCK_METRIC_NAME } from './testUtlls';

jest.mock('react-router-dom', () => ({
	...jest.requireActual('react-router-dom'),
	useLocation: (): { pathname: string } => ({
		pathname: `${ROUTES.METRICS_EXPLORER}`,
	}),
}));

const useGetMetricAttributesMock = jest.spyOn(
	metricsExplorerHooks,
	'useGetMetricAttributes',
);

describe('AllAttributes', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		useGetMetricAttributesMock.mockReturnValue({
			...getMockMetricAttributesData(),
		});
	});

	it('renders attribute keys, values, and value counts from API data', () => {
		render(
			<AllAttributes
				metricName={MOCK_METRIC_NAME}
				metricType={MetrictypesTypeDTO.gauge}
			/>,
		);

		expect(screen.getByText('attribute1')).toBeInTheDocument();
		expect(screen.getByText('attribute2')).toBeInTheDocument();
		expect(screen.getByText('value1')).toBeInTheDocument();
		expect(screen.getByText('value2')).toBeInTheDocument();
		expect(screen.getByText('value3')).toBeInTheDocument();
	});

	it('handles empty attributes array', () => {
		useGetMetricAttributesMock.mockReturnValue({
			...getMockMetricAttributesData({
				data: {
					attributes: [],
					totalKeys: 0,
				},
			}),
		});
		render(
			<AllAttributes
				metricName={MOCK_METRIC_NAME}
				metricType={MetrictypesTypeDTO.gauge}
			/>,
		);

		expect(screen.getByText('All attributes')).toBeInTheDocument();
		expect(screen.getByText('No attributes found')).toBeInTheDocument();
	});

	it('offers Open in Metric Explorer and Copy Key on every key without a menu', async () => {
		const handleExplorerTabChange = jest.fn();
		jest
			.spyOn(useHandleExplorerTabChangeHooks, 'useHandleExplorerTabChange')
			.mockReturnValue({ handleExplorerTabChange });
		render(
			<AllAttributes
				metricName={MOCK_METRIC_NAME}
				metricType={MetrictypesTypeDTO.gauge}
			/>,
		);

		expect(
			screen.getByRole('button', { name: 'Copy key attribute1' }),
		).toBeInTheDocument();
		await userEvent.click(
			screen.getByRole('button', {
				name: 'Open in Metric Explorer grouped by attribute1',
			}),
		);

		expect(handleExplorerTabChange).toHaveBeenCalledWith(
			'graph',
			expect.objectContaining({ query: expect.any(Object) }),
			ROUTES.METRICS_EXPLORER_EXPLORER,
			true,
		);
		const { query } = handleExplorerTabChange.mock.calls[0][1];
		expect(query.builder.queryData[0].groupBy[0].key).toBe('attribute1');
	});

	it('lists the keys with the most values first', () => {
		useGetMetricAttributesMock.mockReturnValue({
			...getMockMetricAttributesData({
				data: {
					attributes: [
						{ key: 'few', values: ['a'], valueCount: 1 },
						{ key: 'many', values: ['a', 'b', 'c'], valueCount: 3 },
						{ key: 'some', values: ['a', 'b'], valueCount: 2 },
					],
					totalKeys: 3,
				},
			}),
		});
		render(
			<AllAttributes
				metricName={MOCK_METRIC_NAME}
				metricType={MetrictypesTypeDTO.gauge}
			/>,
		);

		const keys = screen
			.getAllByTestId('metric-attribute-key')
			.map((node) => node.textContent);
		expect(keys).toStrictEqual(['many', 'some', 'few']);
		expect(screen.getByText('3 values')).toBeInTheDocument();
		expect(screen.getByText('1 value')).toBeInTheDocument();
	});

	it('filters attributes based on search input', async () => {
		render(
			<AllAttributes
				metricName={MOCK_METRIC_NAME}
				metricType={MetrictypesTypeDTO.gauge}
			/>,
		);
		await userEvent.type(screen.getByPlaceholderText('Search'), 'value1');

		expect(screen.getByText('attribute1')).toBeInTheDocument();
		expect(screen.getByText('value1')).toBeInTheDocument();
	});

	it('shows error state when attribute fetching fails', () => {
		useGetMetricAttributesMock.mockReturnValue({
			...getMockMetricAttributesData(
				{
					data: {
						attributes: [],
						totalKeys: 0,
					},
				},
				{
					isError: true,
				},
			),
		});
		render(
			<AllAttributes
				metricName={MOCK_METRIC_NAME}
				metricType={MetrictypesTypeDTO.gauge}
			/>,
		);

		expect(
			screen.getByText('Something went wrong while fetching attributes'),
		).toBeInTheDocument();
	});

	it('does not show misleading empty text while loading', () => {
		useGetMetricAttributesMock.mockReturnValue({
			...getMockMetricAttributesData(
				{
					data: {
						attributes: [],
						totalKeys: 0,
					},
				},
				{
					isLoading: true,
				},
			),
		});
		render(
			<AllAttributes
				metricName={MOCK_METRIC_NAME}
				metricType={MetrictypesTypeDTO.gauge}
			/>,
		);

		expect(screen.queryByText('No attributes found')).not.toBeInTheDocument();
	});
});

describe('AllAttributesValue', () => {
	const mockGoToMetricsExploreWithAppliedAttribute = jest.fn();

	beforeEach(() => {
		jest.clearAllMocks();
	});

	it('shows All values button when there are more than 5 values', () => {
		render(
			<AllAttributesValue
				filterKey="attribute1"
				filterValue={['value1', 'value2', 'value3', 'value4', 'value5', 'value6']}
				goToMetricsExploreWithAppliedAttribute={
					mockGoToMetricsExploreWithAppliedAttribute
				}
			/>,
		);
		expect(screen.queryByText('value6')).not.toBeInTheDocument();
		expect(screen.getByText('All values (6)')).toBeInTheDocument();
	});

	it('All values popover shows values beyond the initial 5', async () => {
		const values = [
			'value1',
			'value2',
			'value3',
			'value4',
			'value5',
			'value6',
			'value7',
		];
		render(
			<AllAttributesValue
				filterKey="attribute1"
				filterValue={values}
				goToMetricsExploreWithAppliedAttribute={
					mockGoToMetricsExploreWithAppliedAttribute
				}
			/>,
		);

		await userEvent.click(screen.getByText('All values (7)'));

		expect(screen.getByText('value6')).toBeInTheDocument();
		expect(screen.getByText('value7')).toBeInTheDocument();
	});

	it('All values popover search filters the value list', async () => {
		const values = [
			'alpha',
			'bravo',
			'charlie',
			'delta',
			'echo',
			'fig-special',
			'golf-target',
		];
		render(
			<AllAttributesValue
				filterKey="attribute1"
				filterValue={values}
				goToMetricsExploreWithAppliedAttribute={
					mockGoToMetricsExploreWithAppliedAttribute
				}
			/>,
		);

		await userEvent.click(screen.getByText('All values (7)'));
		await userEvent.type(screen.getByPlaceholderText('Search values'), 'golf');

		expect(screen.getByText('golf-target')).toBeInTheDocument();
		expect(screen.queryByText('fig-special')).not.toBeInTheDocument();
	});
});
