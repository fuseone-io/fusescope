import { useSearchParams } from 'react-router-dom-v5-compat';
import * as metricsHooks from 'api/generated/services/metrics';
import { initialQueriesMap } from 'constants/queryBuilder';
import ROUTES from 'constants/routes';
import * as useQueryBuilderHooks from 'hooks/queryBuilder/useQueryBuilder';
import { render, screen, waitFor } from 'tests/test-utils';
import { DataSource, QueryBuilderContextType } from 'types/common/queryBuilder';

import Summary from '../Summary';
import { useMetricsCount } from '../useMetricsCount';

jest.mock('react-router-dom-v5-compat', () => {
	const actual = jest.requireActual('react-router-dom-v5-compat');
	return {
		...actual,
		useSearchParams: jest.fn(),
		useNavigationType: (): any => 'PUSH',
	};
});
jest.mock('react-router-dom', () => ({
	...jest.requireActual('react-router-dom'),
	useLocation: (): { pathname: string } => ({
		pathname: `${ROUTES.METRICS_EXPLORER_BASE}`,
	}),
}));
jest.mock('hooks/queryBuilder/useShareBuilderUrl', () => ({
	useShareBuilderUrl: jest.fn(),
}));

// so filter expression assertions easy
jest.mock('../MetricsSearch', () => {
	return function MockMetricsSearch(props: {
		currentQueryFilterExpression: string;
	}): JSX.Element {
		return (
			<div data-testid="metrics-search-expression">
				{props.currentQueryFilterExpression}
			</div>
		);
	};
});

const mockSetSearchParams = jest.fn();
const mockGetMetricsStats = jest.fn();
const mockGetMetricsTreemap = jest.fn();

const mockUseQueryBuilderData = {
	handleRunQuery: jest.fn(),
	stagedQuery: initialQueriesMap[DataSource.METRICS],
	updateAllQueriesOperators: jest.fn(),
	currentQuery: initialQueriesMap[DataSource.METRICS],
	resetQuery: jest.fn(),
	redirectWithQueryBuilderData: jest.fn(),
	isStagedQueryUpdated: jest.fn(),
	handleSetQueryData: jest.fn(),
	handleSetFormulaData: jest.fn(),
	handleSetQueryItemData: jest.fn(),
	handleSetConfig: jest.fn(),
	removeQueryBuilderEntityByIndex: jest.fn(),
	removeQueryTypeItemByIndex: jest.fn(),
	isDefaultQuery: jest.fn(),
};

const useGetMetricsStatsSpy = jest.spyOn(metricsHooks, 'useGetMetricsStats');
const useGetMetricsTreemapSpy = jest.spyOn(
	metricsHooks,
	'useGetMetricsTreemap',
);
const useQueryBuilderSpy = jest.spyOn(useQueryBuilderHooks, 'useQueryBuilder');

describe('Summary', () => {
	beforeEach(() => {
		jest.clearAllMocks();

		(useSearchParams as jest.Mock).mockReturnValue([
			new URLSearchParams(),
			mockSetSearchParams,
		]);

		useGetMetricsStatsSpy.mockReturnValue({
			data: null,
			mutate: mockGetMetricsStats,
			isLoading: true,
			isError: false,
			error: null,
			isIdle: true,
			isSuccess: false,
			reset: jest.fn(),
			status: 'idle',
		} as any);

		useGetMetricsTreemapSpy.mockReturnValue({
			data: null,
			mutate: mockGetMetricsTreemap,
			isLoading: true,
			isError: false,
			error: null,
			isIdle: true,
			isSuccess: false,
			reset: jest.fn(),
			status: 'idle',
		} as any);

		useQueryBuilderSpy.mockReturnValue({
			...mockUseQueryBuilderData,
		} as Partial<QueryBuilderContextType> as QueryBuilderContextType);
	});

	it('does not carry filter expression from a previous page', async () => {
		const staleFilterExpression = "service.name = 'redis'";

		// prev filter from logs explorer
		const staleQuery = {
			...initialQueriesMap[DataSource.METRICS],
			builder: {
				...initialQueriesMap[DataSource.METRICS].builder,
				queryData: [
					{
						...initialQueriesMap[DataSource.METRICS].builder.queryData[0],
						filter: { expression: staleFilterExpression },
					},
				],
			},
		};

		// stagedQuery has stale filter (before QueryBuilder resets it)
		useQueryBuilderSpy.mockReturnValue({
			...mockUseQueryBuilderData,
			stagedQuery: staleQuery,
			currentQuery: staleQuery,
		} as Partial<QueryBuilderContextType> as QueryBuilderContextType);

		const { rerender } = render(<Summary />);

		expect(screen.getByTestId('metrics-search-expression')).toHaveTextContent(
			staleFilterExpression,
		);

		// QB route change effect resets stagedQuery to null
		useQueryBuilderSpy.mockReturnValue({
			...mockUseQueryBuilderData,
			stagedQuery: null,
			currentQuery: initialQueriesMap[DataSource.METRICS],
		} as Partial<QueryBuilderContextType> as QueryBuilderContextType);

		rerender(<Summary />);

		await waitFor(() => {
			expect(
				screen.getByTestId('metrics-search-expression'),
			).toBeEmptyDOMElement();
		});
	});

	it('persists inspect modal open state across page refresh', () => {
		(useSearchParams as jest.Mock).mockReturnValue([
			new URLSearchParams({
				isInspectModalOpen: 'true',
				selectedMetricName: 'test-metric',
			}),
			mockSetSearchParams,
		]);

		render(<Summary />);

		expect(screen.queryByText('Proportion view')).not.toBeInTheDocument();
	});

	it('persists metric details modal state across page refresh', () => {
		(useSearchParams as jest.Mock).mockReturnValue([
			new URLSearchParams({
				isMetricDetailsOpen: 'true',
				selectedMetricName: 'test-metric',
			}),
			mockSetSearchParams,
		]);

		render(<Summary />);

		expect(screen.queryByText('Proportion view')).not.toBeInTheDocument();
	});

	it('hands the list total to the page header once loaded', () => {
		useMetricsCount.setState({ count: null });
		useGetMetricsStatsSpy.mockReturnValue({
			data: {
				status: 'success',
				data: {
					total: 186,
					metrics: [
						{
							metricName: 'signoz_calls_total',
							description: '',
							type: 'sum',
							unit: '',
							samples: 10,
							timeseries: 2,
						},
					],
				},
			},
			mutate: mockGetMetricsStats,
			isLoading: false,
			isError: false,
			error: null,
			reset: jest.fn(),
		} as any);

		const { unmount } = render(<Summary />);

		expect(useMetricsCount.getState().count).toBe(186);

		unmount();
		expect(useMetricsCount.getState().count).toBeNull();
	});

	it('clears the header count while the list loads', () => {
		useMetricsCount.setState({ count: 12 });

		render(<Summary />);

		expect(useMetricsCount.getState().count).toBeNull();
	});
});
