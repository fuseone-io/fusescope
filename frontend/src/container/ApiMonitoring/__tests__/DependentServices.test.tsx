import { fireEvent, render, screen } from '@testing-library/react';
import { getFormattedDependentServicesData } from 'container/ApiMonitoring/utils';
import { SuccessResponse } from 'types/api';

import DependentServices from '../Explorer/Domains/DomainDetails/components/DependentServices';
import ErrorState from '../Explorer/Domains/DomainDetails/components/ErrorState';

// Create a partial mock of the UseQueryResult interface for testing
interface MockQueryResult {
	isLoading: boolean;
	isRefetching: boolean;
	isError: boolean;
	data?: any;
	refetch: () => void;
}

// Mock the utility function
jest.mock('container/ApiMonitoring/utils', () => ({
	getFormattedDependentServicesData: jest.fn(),
}));

// Mock the ErrorState component
jest.mock('../Explorer/Domains/DomainDetails/components/ErrorState', () => ({
	__esModule: true,
	default: jest.fn().mockImplementation(({ refetch }) => (
		<div data-testid="error-state-mock">
			<button type="button" data-testid="refetch-button" onClick={refetch}>
				Retry
			</button>
		</div>
	)),
}));

describe('DependentServices', () => {
	// Sample mock data to use in tests
	const mockDependentServicesData = [
		{
			key: 'service1',
			serviceData: {
				serviceName: 'auth-service',
				count: 500,
				percentage: 62.5,
			},
			latency: 120,
			rate: '15',
			errorPercentage: '2.5',
		},
		{
			key: 'service2',
			serviceData: {
				serviceName: 'db-service',
				count: 300,
				percentage: 37.5,
			},
			latency: 80,
			rate: '10',
			errorPercentage: '1.2',
		},
	];

	// Default props for tests
	const mockTimeRange = {
		startTime: 1609459200000,
		endTime: 1609545600000,
	};

	const refetchFn = jest.fn();

	beforeEach(() => {
		jest.clearAllMocks();
		(getFormattedDependentServicesData as jest.Mock).mockReturnValue(
			mockDependentServicesData,
		);
	});

	it('renders loading state correctly', () => {
		// Arrange
		const mockQuery: MockQueryResult = {
			isLoading: true,
			isRefetching: false,
			isError: false,
			data: undefined,
			refetch: refetchFn,
		};

		// Act
		render(
			<DependentServices
				dependentServicesQuery={mockQuery as any}
				timeRange={mockTimeRange}
			/>,
		);

		// Assert
		expect(
			screen.getAllByTestId('dependent-service-row-loading').length,
		).toBeGreaterThan(0);
	});

	it('renders error state correctly', () => {
		// Arrange
		const mockQuery: MockQueryResult = {
			isLoading: false,
			isRefetching: false,
			isError: true,
			data: undefined,
			refetch: refetchFn,
		};

		// Act
		render(
			<DependentServices
				dependentServicesQuery={mockQuery as any}
				timeRange={mockTimeRange}
			/>,
		);

		// Assert
		expect(screen.getByTestId('error-state-mock')).toBeInTheDocument();
		expect(ErrorState).toHaveBeenCalledWith(
			expect.objectContaining({ refetch: expect.any(Function) }),
			expect.anything(),
		);
	});

	it('renders data correctly when loaded', () => {
		// Arrange
		const mockData = {
			payload: {
				data: {
					result: [
						{
							table: {
								rows: [
									{
										data: {
											'service.name': 'auth-service',
											A: '500',
											B: '120000000',
											C: '15',
											F1: '2.5',
										},
									},
								],
							},
						},
					],
				},
			},
		} as SuccessResponse<any>;

		const mockQuery: MockQueryResult = {
			isLoading: false,
			isRefetching: false,
			isError: false,
			data: mockData,
			refetch: refetchFn,
		};

		// Act
		render(
			<DependentServices
				dependentServicesQuery={mockQuery as any}
				timeRange={mockTimeRange}
			/>,
		);

		// Assert
		expect(getFormattedDependentServicesData).toHaveBeenCalledWith(
			mockData.payload.data.result[0].table.rows,
		);

		const rows = screen.getAllByTestId('dependent-service-row');
		expect(rows).toHaveLength(2);
		expect(rows[0]).toHaveTextContent('auth-service');
		expect(rows[0]).toHaveTextContent('120 ms');
		expect(rows[0]).toHaveTextContent('2.5%');
		expect(screen.getByText('p99 latency')).toBeInTheDocument();
	});

	it('handles refetching state correctly', () => {
		// Arrange
		const mockQuery: MockQueryResult = {
			isLoading: false,
			isRefetching: true,
			isError: false,
			data: undefined,
			refetch: refetchFn,
		};

		// Act
		render(
			<DependentServices
				dependentServicesQuery={mockQuery as any}
				timeRange={mockTimeRange}
			/>,
		);

		// Assert
		expect(
			screen.getAllByTestId('dependent-service-row-loading').length,
		).toBeGreaterThan(0);
	});

	it('handles row click correctly', () => {
		// Mock window.open
		const originalOpen = window.open;
		window.open = jest.fn();

		// Arrange
		const mockData = {
			payload: {
				data: {
					result: [
						{
							table: {
								rows: [
									{
										data: {
											'service.name': 'auth-service',
											A: '500',
											B: '120000000',
											C: '15',
											F1: '2.5',
										},
									},
								],
							},
						},
					],
				},
			},
		} as SuccessResponse<any>;

		const mockQuery: MockQueryResult = {
			isLoading: false,
			isRefetching: false,
			isError: false,
			data: mockData,
			refetch: refetchFn,
		};

		// Act
		render(
			<DependentServices
				dependentServicesQuery={mockQuery as any}
				timeRange={mockTimeRange}
			/>,
		);

		// Click on the first row
		fireEvent.click(screen.getAllByTestId('dependent-service-row')[0]);

		// Assert
		expect(window.open).toHaveBeenCalledWith(
			expect.stringContaining('/services/auth-service'),
			'_blank',
		);

		// Restore original window.open
		window.open = originalOpen;
	});

	it('expands table when showing more', () => {
		// Set up more than 5 items so the "show more" button appears
		const moreItems = Array(8)
			.fill(0)
			.map((_, index) => ({
				key: `service${index}`,
				serviceData: {
					serviceName: `service-${index}`,
					count: 100,
					percentage: 12.5,
				},
				latency: 100,
				rate: '10',
				errorPercentage: '1',
			}));

		(getFormattedDependentServicesData as jest.Mock).mockReturnValue(moreItems);

		const mockData = {
			payload: { data: { result: [{ table: { rows: [] } }] } },
		} as SuccessResponse<any>;
		const mockQuery: MockQueryResult = {
			isLoading: false,
			isRefetching: false,
			isError: false,
			data: mockData,
			refetch: refetchFn,
		};

		// Render the component
		render(
			<DependentServices
				dependentServicesQuery={mockQuery as any}
				timeRange={mockTimeRange}
			/>,
		);

		// Find the "Show more" button (using container query since it might not have a testId)
		const showMoreButton = screen.getByText(/Show more/i);
		expect(showMoreButton).toBeInTheDocument();

		expect(screen.getAllByTestId('dependent-service-row')).toHaveLength(5);

		// Click the button to expand
		fireEvent.click(showMoreButton);

		expect(screen.getAllByTestId('dependent-service-row')).toHaveLength(8);

		// Text should have changed to "Show less"
		expect(screen.getByText(/Show less/i)).toBeInTheDocument();
	});
});
