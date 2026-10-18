import { useCallback, useEffect, useMemo } from 'react';
import { useHistory } from 'react-router-dom';
import { useListRoles } from 'api/generated/services/role';
import { AuthtypesGettableRoleDTO } from 'api/generated/services/fuseScope.schemas';
import ErrorInPlace from 'components/ErrorInPlace/ErrorInPlace';
import Panel from 'components/PageTemplate/components/Panel';
import TablePagination from 'components/PageTemplate/components/TablePagination';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from 'components/ui/table';
import ROUTES from 'constants/routes';
import { useRolesFeatureGate } from 'hooks/useRolesFeatureGate';
import useUrlQuery from 'hooks/useUrlQuery';
import { withAuthZContent } from 'lib/authz/components/withAuthZ/withAuthZContent';
import { RoleListPermission } from 'lib/authz/hooks/useAuthZ/permissions/role.permissions';
import ListEmptyState from 'pages/Settings/components/ListEmptyState';
import { RoleType } from 'types/roles';
import { toAPIError } from 'utils/errorUtils';

import RoleRow from './RoleRow';
import RolesListingSkeleton from './RolesListingSkeleton';

const PAGE_SIZE = 20;

type DisplayItem =
	| { type: 'section'; label: string; count?: number }
	| { type: 'role'; role: AuthtypesGettableRoleDTO };

interface RolesListContentProps {
	searchQuery: string;
}

function RolesListContent({ searchQuery }: RolesListContentProps): JSX.Element {
	const { isRolesEnabled } = useRolesFeatureGate();

	const { data, isLoading, isError, error } = useListRoles();
	const history = useHistory();
	const urlQuery = useUrlQuery();
	const pageParam = parseInt(urlQuery.get('page') ?? '1', 10);
	const currentPage = Number.isNaN(pageParam) || pageParam < 1 ? 1 : pageParam;

	const setCurrentPage = useCallback(
		(page: number): void => {
			urlQuery.set('page', String(page));
			history.replace({ search: urlQuery.toString() });
		},
		[history, urlQuery],
	);

	const roles = useMemo(() => data?.data ?? [], [data]);

	const filteredRoles = useMemo(() => {
		if (!searchQuery.trim()) {
			return roles;
		}
		const query = searchQuery.toLowerCase();
		return roles.filter(
			(role) =>
				role.name?.toLowerCase().includes(query) ||
				role.description?.toLowerCase().includes(query),
		);
	}, [roles, searchQuery]);

	const managedRoles = useMemo(
		() =>
			filteredRoles.filter(
				(role) => role.type?.toLowerCase() === RoleType.MANAGED,
			),
		[filteredRoles],
	);
	const customRoles = useMemo(
		() =>
			filteredRoles.filter((role) => role.type?.toLowerCase() === RoleType.CUSTOM),
		[filteredRoles],
	);

	const displayList = useMemo((): DisplayItem[] => {
		const result: DisplayItem[] = [];

		if (managedRoles.length > 0) {
			result.push({ type: 'section', label: 'Managed roles' });
			managedRoles.forEach((role) => result.push({ type: 'role', role }));
		}
		if (customRoles.length > 0) {
			result.push({
				type: 'section',
				label: 'Custom roles',
				count: customRoles.length,
			});
			customRoles.forEach((role) => result.push({ type: 'role', role }));
		}
		return result;
	}, [managedRoles, customRoles]);

	const totalRoleCount = managedRoles.length + customRoles.length;

	useEffect(() => {
		if (isLoading || totalRoleCount === 0) {
			return;
		}
		const maxPage = Math.ceil(totalRoleCount / PAGE_SIZE);
		if (currentPage > maxPage) {
			setCurrentPage(maxPage);
		}
	}, [isLoading, totalRoleCount, currentPage, setCurrentPage]);

	const paginatedItems = useMemo((): DisplayItem[] => {
		const startRole = (currentPage - 1) * PAGE_SIZE;
		const endRole = startRole + PAGE_SIZE;
		let roleIndex = 0;
		let lastSection: DisplayItem | null = null;
		const result: DisplayItem[] = [];

		for (const item of displayList) {
			if (item.type === 'section') {
				lastSection = item;
			} else {
				if (roleIndex >= startRole && roleIndex < endRole) {
					if (lastSection) {
						result.push(lastSection);
						lastSection = null;
					}
					result.push(item);
				}
				roleIndex++;
			}
		}
		return result;
	}, [displayList, currentPage]);

	const handleRowClick = useCallback(
		(roleId: string, roleName: string): void => {
			if (isRolesEnabled) {
				const url = `${ROUTES.ROLE_DETAILS.replace(':roleId', roleId)}?name=${encodeURIComponent(roleName)}`;
				history.push(url);
			}
		},
		[isRolesEnabled, history],
	);

	if (isLoading) {
		return <RolesListingSkeleton />;
	}

	if (isError) {
		return (
			<ErrorInPlace
				error={toAPIError(
					error,
					'An unexpected error occurred while fetching roles.',
				)}
			/>
		);
	}

	if (filteredRoles.length === 0) {
		return (
			<Panel>
				<ListEmptyState testId="roles-empty-state">
					{searchQuery ? 'No roles match your search.' : 'No roles found.'}
				</ListEmptyState>
			</Panel>
		);
	}

	return (
		<Panel className="tw:overflow-hidden">
			<Table className="tw:min-w-[720px] tw:table-fixed">
				<TableHeader className="tw:bg-surface-sunken">
					<TableRow>
						<TableHead className="tw:w-[24%]">Name</TableHead>
						<TableHead>Description</TableHead>
						<TableHead className="tw:w-[200px]">Updated At</TableHead>
						<TableHead className="tw:w-[200px]">Created At</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{paginatedItems.map((item) =>
						item.type === 'section' ? (
							<TableRow
								key={`section-${item.label}`}
								className="tw:hover:bg-transparent"
							>
								<TableCell
									colSpan={4}
									className="tw:h-9 tw:text-xs tw:font-medium tw:tracking-[0.05em] tw:text-subtle-foreground tw:uppercase"
								>
									<h3 className="tw:inline-flex tw:items-center tw:gap-2">
										{item.label}
										{item.count !== undefined && (
											<span className="tw:rounded-sm tw:bg-muted tw:px-1.5 tw:text-muted-foreground tw:tabular-nums">
												{item.count}
											</span>
										)}
									</h3>
								</TableCell>
							</TableRow>
						) : (
							<RoleRow
								key={item.role.id}
								role={item.role}
								clickable={isRolesEnabled}
								onOpen={handleRowClick}
							/>
						),
					)}
				</TableBody>
			</Table>
			<TablePagination
				page={currentPage}
				pageSize={PAGE_SIZE}
				total={totalRoleCount}
				onPageChange={setCurrentPage}
			/>
		</Panel>
	);
}

export default withAuthZContent<RolesListContentProps>(RolesListContent, {
	checks: [RoleListPermission],
	fallbackOnLoading: <RolesListingSkeleton />,
});
