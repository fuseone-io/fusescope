import { useState } from 'react';
import ConfigListSkeleton from 'components/Alerts/ConfigSectionHeader/ConfigListSkeleton';
import ConfigListState from 'components/Alerts/ConfigSectionHeader/ConfigListState';
import ContentPanel from 'components/PageTemplate/components/ContentPanel';
import TablePagination from 'components/PageTemplate/components/TablePagination';
import { Button } from 'components/ui/button';
import {
	Table,
	TableBody,
	TableHead,
	TableHeader,
	TableRow,
} from 'components/ui/table';
import { fuseScopeDocsUrl } from 'constants/docs';
import { Plus, RotateCw, Route, Search, TriangleAlert } from 'lucide-react';
import { useAppContext } from 'providers/App/App';
import { USER_ROLES } from 'types/roles';

import { ROUTING_POLICY_COLUMN_COUNT } from './constants';
import RoutingPolicyListItem from './RoutingPolicyListItem';
import { RoutingPolicyListProps } from './types';

const PAGE_SIZE = 5;
const COLUMNS = ['Routing policy', 'Expression', 'Channels', 'Updated'];

function RoutingPolicyList({
	routingPolicies,
	refetchRoutingPolicies,
	isRoutingPoliciesFetching,
	isRoutingPoliciesLoading,
	isRoutingPoliciesError,
	handlePolicyDetailsModalOpen,
	handleDeleteModalOpen,
	hasSearchTerm,
}: RoutingPolicyListProps): JSX.Element {
	const { user } = useAppContext();
	const [page, setPage] = useState(1);

	const showLoading = isRoutingPoliciesLoading || isRoutingPoliciesFetching;
	const showError = !showLoading && isRoutingPoliciesError;
	const pageCount = Math.max(1, Math.ceil(routingPolicies.length / PAGE_SIZE));
	const currentPage = Math.min(page, pageCount);
	const pageRows = routingPolicies.slice(
		(currentPage - 1) * PAGE_SIZE,
		currentPage * PAGE_SIZE,
	);

	const renderEmpty = (): JSX.Element => {
		if (showError) {
			return (
				<ConfigListState
					colSpan={ROUTING_POLICY_COLUMN_COUNT}
					icon={<TriangleAlert />}
					title="Something went wrong while fetching routing policies."
					action={
						<Button variant="outline" size="sm" onClick={refetchRoutingPolicies}>
							<RotateCw aria-hidden="true" />
							Retry
						</Button>
					}
				/>
			);
		}
		if (hasSearchTerm) {
			return (
				<ConfigListState
					colSpan={ROUTING_POLICY_COLUMN_COUNT}
					icon={<Search />}
					title="No matching routing policies found."
				/>
			);
		}
		return (
			<ConfigListState
				colSpan={ROUTING_POLICY_COLUMN_COUNT}
				icon={<Route />}
				title="No routing policies yet"
				description={
					<>
						Route firing alerts to channels by matching their labels.{' '}
						<a
							href={fuseScopeDocsUrl('/alerts/routing-and-downtime/#routing-policies')}
							target="_blank"
							rel="noopener noreferrer"
							className="tw:text-primary-ink tw:underline-offset-4 tw:hover:underline"
						>
							Learn more
						</a>
					</>
				}
				action={
					user?.role === USER_ROLES.VIEWER ? undefined : (
						<Button
							variant="outline"
							size="sm"
							onClick={(): void => handlePolicyDetailsModalOpen('create', null)}
						>
							<Plus aria-hidden="true" />
							New routing policy
						</Button>
					)
				}
			/>
		);
	};

	return (
		<ContentPanel
			testId="routing-policies-panel"
			footer={
				routingPolicies.length > PAGE_SIZE ||
				!routingPolicies.length ? undefined : (
					<span className="tw:tabular-nums">
						{`${routingPolicies.length} ${routingPolicies.length === 1 ? 'policy' : 'policies'}`}
					</span>
				)
			}
		>
			<Table aria-busy={showLoading}>
				<TableHeader className="tw:bg-surface-sunken">
					<TableRow>
						{COLUMNS.map((column) => (
							<TableHead key={column}>{column}</TableHead>
						))}
						<TableHead>
							<span className="tw:sr-only">Actions</span>
						</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody
					className={
						showLoading && routingPolicies.length ? 'tw:opacity-60' : undefined
					}
				>
					{showLoading && !routingPolicies.length && (
						<ConfigListSkeleton colSpan={ROUTING_POLICY_COLUMN_COUNT} />
					)}
					{!showLoading && !routingPolicies.length && renderEmpty()}
					{pageRows.map((routingPolicy) => (
						<RoutingPolicyListItem
							key={routingPolicy.id}
							routingPolicy={routingPolicy}
							handlePolicyDetailsModalOpen={handlePolicyDetailsModalOpen}
							handleDeleteModalOpen={handleDeleteModalOpen}
						/>
					))}
				</TableBody>
			</Table>
			<TablePagination
				page={currentPage}
				pageSize={PAGE_SIZE}
				total={routingPolicies.length}
				onPageChange={setPage}
			/>
		</ContentPanel>
	);
}

export default RoutingPolicyList;
