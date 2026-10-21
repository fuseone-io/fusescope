import { fireEvent, render, screen } from '@testing-library/react';
import * as appHooks from 'providers/App/App';

import RoutingPoliciesList from '../RoutingPolicyList';
import { RoutingPolicyListItemProps } from '../types';
import {
	getAppContextMockState,
	getUseRoutingPoliciesMockData,
} from './testUtils';

jest.spyOn(appHooks, 'useAppContext').mockReturnValue(getAppContextMockState());

const useRoutingPolicesMockData = getUseRoutingPoliciesMockData();
const mockHandlePolicyDetailsModalOpen = jest.fn();
const mockHandleDeleteModalOpen = jest.fn();
const mockRefetchRoutingPolicies = jest.fn();

jest.mock('../RoutingPolicyListItem', () => ({
	__esModule: true,
	default: jest.fn(({ routingPolicy }: RoutingPolicyListItemProps) => (
		<tr data-testid="routing-policy-list-item">
			<td>{routingPolicy.name}</td>
		</tr>
	)),
}));

const ROUTING_POLICY_LIST_ITEM_TEST_ID = 'routing-policy-list-item';

describe('RoutingPoliciesList', () => {
	it('renders base layout with routing policies', () => {
		render(
			<RoutingPoliciesList
				routingPolicies={useRoutingPolicesMockData.routingPoliciesData}
				isRoutingPoliciesLoading={
					useRoutingPolicesMockData.isLoadingRoutingPolicies
				}
				isRoutingPoliciesError={useRoutingPolicesMockData.isErrorRoutingPolicies}
				handlePolicyDetailsModalOpen={mockHandlePolicyDetailsModalOpen}
				handleDeleteModalOpen={mockHandleDeleteModalOpen}
				hasSearchTerm={false}
				refetchRoutingPolicies={mockRefetchRoutingPolicies}
				isRoutingPoliciesFetching={false}
			/>,
		);

		const routingPolicyItems = screen.getAllByTestId(
			ROUTING_POLICY_LIST_ITEM_TEST_ID,
		);
		expect(routingPolicyItems).toHaveLength(2);
		expect(routingPolicyItems[0]).toHaveTextContent(
			useRoutingPolicesMockData.routingPoliciesData[0].name,
		);
		expect(routingPolicyItems[1]).toHaveTextContent(
			useRoutingPolicesMockData.routingPoliciesData[1].name,
		);
	});

	it('renders loading state', () => {
		render(
			<RoutingPoliciesList
				routingPolicies={useRoutingPolicesMockData.routingPoliciesData}
				isRoutingPoliciesLoading
				isRoutingPoliciesError={false}
				handlePolicyDetailsModalOpen={mockHandlePolicyDetailsModalOpen}
				handleDeleteModalOpen={mockHandleDeleteModalOpen}
				hasSearchTerm={false}
				refetchRoutingPolicies={mockRefetchRoutingPolicies}
				isRoutingPoliciesFetching={false}
			/>,
		);
		expect(screen.getByRole('table')).toHaveAttribute('aria-busy', 'true');
		expect(screen.getAllByTestId(ROUTING_POLICY_LIST_ITEM_TEST_ID)).toHaveLength(
			2,
		);
	});

	it('renders loading state when data is being fetched', () => {
		render(
			<RoutingPoliciesList
				routingPolicies={useRoutingPolicesMockData.routingPoliciesData}
				isRoutingPoliciesLoading={false}
				isRoutingPoliciesError={false}
				handlePolicyDetailsModalOpen={mockHandlePolicyDetailsModalOpen}
				handleDeleteModalOpen={mockHandleDeleteModalOpen}
				hasSearchTerm={false}
				refetchRoutingPolicies={mockRefetchRoutingPolicies}
				isRoutingPoliciesFetching
			/>,
		);
		expect(screen.getByRole('table')).toHaveAttribute('aria-busy', 'true');
		expect(screen.getAllByTestId(ROUTING_POLICY_LIST_ITEM_TEST_ID)).toHaveLength(
			2,
		);
	});

	it('renders error state', () => {
		render(
			<RoutingPoliciesList
				routingPolicies={[]}
				isRoutingPoliciesLoading={false}
				isRoutingPoliciesError
				handlePolicyDetailsModalOpen={mockHandlePolicyDetailsModalOpen}
				handleDeleteModalOpen={mockHandleDeleteModalOpen}
				hasSearchTerm={false}
				refetchRoutingPolicies={mockRefetchRoutingPolicies}
				isRoutingPoliciesFetching={false}
			/>,
		);
		expect(
			screen.getByText('Something went wrong while fetching routing policies.'),
		).toBeInTheDocument();

		const retryButton = screen.getByRole('button', { name: 'Retry' });
		expect(retryButton).toBeInTheDocument();
		fireEvent.click(retryButton);
		expect(mockRefetchRoutingPolicies).toHaveBeenCalled();
	});

	it('renders empty state', () => {
		render(
			<RoutingPoliciesList
				routingPolicies={[]}
				isRoutingPoliciesLoading={false}
				isRoutingPoliciesError={false}
				handlePolicyDetailsModalOpen={mockHandlePolicyDetailsModalOpen}
				handleDeleteModalOpen={mockHandleDeleteModalOpen}
				hasSearchTerm={false}
				refetchRoutingPolicies={mockRefetchRoutingPolicies}
				isRoutingPoliciesFetching={false}
			/>,
		);
		expect(screen.getByText('No routing policies yet')).toBeInTheDocument();
	});
});
