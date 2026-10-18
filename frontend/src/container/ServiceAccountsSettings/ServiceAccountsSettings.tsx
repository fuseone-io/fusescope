import { useCallback, useEffect, useMemo } from 'react';
import { useQueryClient } from 'react-query';
import { Plus } from '@signozhq/icons';
import {
	invalidateListServiceAccounts,
	useListServiceAccounts,
} from 'api/generated/services/serviceaccount';
import { fuseScopeDocsUrl } from 'constants/docs';
import AuthZButton from 'lib/authz/components/AuthZButton/AuthZButton';
import { AuthZGuardContent } from 'lib/authz/components/AuthZGuard/AuthZGuardContent';
import AuthZTooltip from 'lib/authz/components/AuthZTooltip/AuthZTooltip';
import { useAuthZ } from 'lib/authz/hooks/useAuthZ/useAuthZ';
import CreateServiceAccountModal from 'components/CreateServiceAccountModal/CreateServiceAccountModal';
import ErrorInPlace from 'components/ErrorInPlace/ErrorInPlace';
import Panel from 'components/PageTemplate/components/Panel';
import ServiceAccountDrawer from 'components/ServiceAccountDrawer/ServiceAccountDrawer';
import ServiceAccountsTable, {
	PAGE_SIZE,
} from 'components/ServiceAccountsTable/ServiceAccountsTable';
import {
	SACreatePermission,
	SAListPermission,
} from 'lib/authz/hooks/useAuthZ/permissions/service-account.permissions';
import {
	parseAsBoolean,
	parseAsInteger,
	parseAsString,
	parseAsStringEnum,
	useQueryState,
} from 'nuqs';
import SettingsPageShell from 'pages/Settings/components/SettingsPageShell';
import SettingsSearchInput from 'pages/Settings/components/SettingsSearchInput';
import StatusFilterMenu from 'pages/Settings/components/StatusFilterMenu';
import { StatusFilterOption } from 'pages/Settings/components/types';
import { toAPIError } from 'utils/errorUtils';

import { SA_QUERY_PARAMS } from './constants';
import {
	FilterMode,
	ServiceAccountRow,
	ServiceAccountStatus,
	toServiceAccountRow,
} from './utils';

function ServiceAccountsSettings(): JSX.Element {
	const queryClient = useQueryClient();
	const { permissions: authzPermissions, isLoading: isAuthZLoading } = useAuthZ([
		SAListPermission,
	]);
	const canListServiceAccounts =
		authzPermissions?.[SAListPermission]?.isGranted ?? false;
	const [, setSelectedAccountId] = useQueryState(SA_QUERY_PARAMS.ACCOUNT);
	const [currentPage, setPage] = useQueryState(
		SA_QUERY_PARAMS.PAGE,
		parseAsInteger.withDefault(1),
	);
	const [searchQuery, setSearchQuery] = useQueryState(
		SA_QUERY_PARAMS.SEARCH,
		parseAsString.withDefault(''),
	);
	const [filterMode, setFilterMode] = useQueryState(
		SA_QUERY_PARAMS.FILTER,
		parseAsStringEnum<FilterMode>(Object.values(FilterMode)).withDefault(
			FilterMode.All,
		),
	);
	const [, setIsCreateModalOpen] = useQueryState(
		SA_QUERY_PARAMS.CREATE_SA,
		parseAsBoolean.withDefault(false),
	);

	const {
		data: serviceAccountsData,
		isLoading,
		isError,
		error,
	} = useListServiceAccounts({ query: { enabled: canListServiceAccounts } });

	const controlsDisabled = isAuthZLoading || !canListServiceAccounts;

	const allAccounts = useMemo(
		(): ServiceAccountRow[] =>
			(serviceAccountsData?.data ?? []).map(toServiceAccountRow),
		[serviceAccountsData],
	);

	const activeCount = useMemo(
		() =>
			allAccounts.filter(
				(a) => a.status?.toUpperCase() === ServiceAccountStatus.Active,
			).length,
		[allAccounts],
	);

	const deletedCount = useMemo(
		() =>
			allAccounts.filter(
				(a) => a.status?.toUpperCase() === ServiceAccountStatus.Deleted,
			).length,
		[allAccounts],
	);

	const filteredAccounts = useMemo((): ServiceAccountRow[] => {
		let result = allAccounts;

		if (filterMode === FilterMode.Active) {
			result = result.filter(
				(a) => a.status?.toUpperCase() === ServiceAccountStatus.Active,
			);
		} else if (filterMode === FilterMode.Deleted) {
			result = result.filter(
				(a) => a.status?.toUpperCase() === ServiceAccountStatus.Deleted,
			);
		}

		if (searchQuery.trim()) {
			const q = searchQuery.trim().toLowerCase();
			result = result.filter(
				(a) =>
					a.name?.toLowerCase().includes(q) || a.email?.toLowerCase().includes(q),
			);
		}

		return result;
	}, [allAccounts, filterMode, searchQuery]);

	useEffect(() => {
		if (filteredAccounts.length === 0) {
			return;
		}

		const maxPage = Math.max(1, Math.ceil(filteredAccounts.length / PAGE_SIZE));
		if (currentPage > maxPage) {
			void setPage(maxPage);
		} else if (currentPage < 1) {
			void setPage(1);
		}
	}, [filteredAccounts.length, currentPage, setPage]);

	const totalCount = allAccounts.length;

	const filterOptions: StatusFilterOption<FilterMode>[] = [
		{ value: FilterMode.All, label: 'All accounts', count: totalCount },
		{ value: FilterMode.Active, label: 'Active', count: activeCount },
		{ value: FilterMode.Deleted, label: 'Deleted', count: deletedCount },
	];

	const handleFilterChange = (mode: FilterMode): void => {
		void setFilterMode(mode);
		void setPage(1);
	};

	const handleRowClick = useCallback(
		(row: ServiceAccountRow): void => {
			void setSelectedAccountId(row.id);
		},
		[setSelectedAccountId],
	);

	const handleDrawerSuccess = useCallback(
		(options?: { closeDrawer?: boolean }): void => {
			if (options?.closeDrawer) {
				void setSelectedAccountId(null);
			}
			void invalidateListServiceAccounts(queryClient);
		},
		[queryClient, setSelectedAccountId],
	);

	return (
		<SettingsPageShell
			testId="service-accounts-settings"
			title="Service Accounts"
			description={
				<>
					Overview of service accounts added to this workspace.{' '}
					<a
						href={fuseScopeDocsUrl('/administration/service-accounts/')}
						target="_blank"
						rel="noopener noreferrer"
						className="tw:text-primary tw:hover:underline"
					>
						Learn more
					</a>
				</>
			}
			actions={
				<AuthZButton
					size="md"
					checks={[SACreatePermission]}
					variant="solid"
					color="primary"
					onClick={async (): Promise<void> => {
						await setIsCreateModalOpen(true);
					}}
					prefix={<Plus size={12} />}
				>
					New Service Account
				</AuthZButton>
			}
		>
			<div className="tw:flex tw:flex-wrap tw:items-center tw:gap-2">
				<AuthZTooltip checks={[SAListPermission]}>
					<span>
						<StatusFilterMenu
							options={filterOptions}
							value={filterMode}
							onChange={handleFilterChange}
							disabled={controlsDisabled}
						/>
					</span>
				</AuthZTooltip>

				<AuthZTooltip
					checks={[SAListPermission]}
					triggerClassName="tw:min-w-0 tw:flex-[1_1_280px]"
				>
					<SettingsSearchInput
						name="service-accounts-search"
						placeholder="Search by name or email..."
						value={searchQuery}
						onChange={(e): void => {
							void setSearchQuery(e.target.value);
							void setPage(1);
						}}
						disabled={controlsDisabled}
					/>
				</AuthZTooltip>
			</div>

			<AuthZGuardContent checks={[SAListPermission]}>
				{isError ? (
					<ErrorInPlace
						error={toAPIError(
							error,
							'An unexpected error occurred while fetching service accounts.',
						)}
					/>
				) : (
					<Panel className="tw:overflow-hidden">
						<ServiceAccountsTable
							data={filteredAccounts}
							loading={isLoading}
							onRowClick={handleRowClick}
						/>
					</Panel>
				)}
			</AuthZGuardContent>

			<CreateServiceAccountModal />

			<ServiceAccountDrawer onSuccess={handleDrawerSuccess} />
		</SettingsPageShell>
	);
}

export default ServiceAccountsSettings;
