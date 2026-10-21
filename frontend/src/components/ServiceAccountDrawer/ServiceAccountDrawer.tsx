import React, {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from 'react';
import { useQueryClient } from 'react-query';
import { toast } from '@signozhq/ui/sonner';
import { convertToApiError } from 'api/ErrorResponseHandlerForGeneratedAPIs';
import {
	getListServiceAccountsQueryKey,
	useGetServiceAccount,
	useListServiceAccountKeys,
	useUpdateServiceAccount,
} from 'api/generated/services/serviceaccount';
import type { RenderErrorResponseDTO } from 'api/generated/services/fuseScope.schemas';
import { AxiosError } from 'axios';
import ErrorInPlace from 'components/ErrorInPlace/ErrorInPlace';
import SegmentedControl from 'components/PageTemplate/components/SegmentedControl';
import SideSheet from 'components/PageTemplate/components/SideSheet';
import { Button } from 'components/ui/button';
import { Skeleton } from 'components/ui/skeleton';
import { useRoles } from 'components/RolesSelect';
import { SA_QUERY_PARAMS } from 'container/ServiceAccountsSettings/constants';
import {
	ServiceAccountRow,
	ServiceAccountStatus,
	toServiceAccountRow,
} from 'container/ServiceAccountsSettings/utils';
import {
	RoleUpdateFailure,
	useServiceAccountRoleManager,
} from 'hooks/serviceAccount/useServiceAccountRoleManager';
import AuthZTooltip from 'lib/authz/components/AuthZTooltip/AuthZTooltip';
import {
	APIKeyCreatePermission,
	buildSAAttachPermission,
	buildSADeletePermission,
	buildSAReadPermission,
	buildSAUpdatePermission,
} from 'lib/authz/hooks/useAuthZ/permissions/service-account.permissions';
import {
	parseAsBoolean,
	parseAsInteger,
	parseAsString,
	parseAsStringEnum,
	useQueryState,
} from 'nuqs';
import APIError from 'types/api/error';
import { toAPIError } from 'utils/errorUtils';
import { Plus, Trash2 } from 'lucide-react';
import ActionButton from 'pages/Settings/components/ActionButton';

import AddKeyModal from './AddKeyModal';
import DeleteAccountModal from './DeleteAccountModal';
import KeysTab from './KeysTab';
import OverviewTab from './OverviewTab';
import type { SaveError } from './utils';
import { ServiceAccountDrawerTab } from './utils';

export interface ServiceAccountDrawerProps {
	onSuccess: (options?: { closeDrawer?: boolean }) => void;
}

const PAGE_SIZE = 15;

function toSaveApiError(err: unknown): APIError {
	return (
		convertToApiError(err as AxiosError<RenderErrorResponseDTO>) ??
		toAPIError(err as AxiosError<RenderErrorResponseDTO>)
	);
}

function ServiceAccountDrawer({
	onSuccess,
}: ServiceAccountDrawerProps): JSX.Element {
	const [selectedAccountId, setSelectedAccountId] = useQueryState(
		SA_QUERY_PARAMS.ACCOUNT,
	);
	const [activeTab, setActiveTab] = useQueryState(
		SA_QUERY_PARAMS.TAB,
		parseAsStringEnum<ServiceAccountDrawerTab>(
			Object.values(ServiceAccountDrawerTab),
		).withDefault(ServiceAccountDrawerTab.Overview),
	);
	const [keysPage, setKeysPage] = useQueryState(
		SA_QUERY_PARAMS.KEYS_PAGE,
		parseAsInteger.withDefault(1),
	);
	const [, setEditKeyId] = useQueryState(
		SA_QUERY_PARAMS.EDIT_KEY,
		parseAsString.withDefault(''),
	);
	const [, setIsAddKeyOpen] = useQueryState(
		SA_QUERY_PARAMS.ADD_KEY,
		parseAsBoolean.withDefault(false),
	);
	const [, setIsDeleteOpen] = useQueryState(
		SA_QUERY_PARAMS.DELETE_SA,
		parseAsBoolean.withDefault(false),
	);

	const [localName, setLocalName] = useState('');
	const [localRoles, setLocalRoles] = useState<string[]>([]);
	const [isSaving, setIsSaving] = useState(false);
	const [saveErrors, setSaveErrors] = useState<SaveError[]>([]);

	const queryClient = useQueryClient();
	const open = !!selectedAccountId;

	const {
		data: accountData,
		isLoading: isAccountLoading,
		isError: isAccountError,
		error: accountError,
		refetch: refetchAccount,
	} = useGetServiceAccount(
		{ id: selectedAccountId ?? '' },
		{ query: { enabled: !!selectedAccountId } },
	);

	const account = useMemo(
		(): ServiceAccountRow | null =>
			accountData?.data ? toServiceAccountRow(accountData.data) : null,
		[accountData],
	);

	const {
		currentRoles,
		isLoading: isRolesLoading,
		applyDiff,
	} = useServiceAccountRoleManager(selectedAccountId ?? '', {
		enabled: !!selectedAccountId,
	});

	const roleSessionRef = useRef<string | null>(null);

	useEffect(() => {
		if (account?.id) {
			setLocalName(account?.name ?? '');
			void setKeysPage(1);
		}
	}, [account?.id, account?.name, setKeysPage]);

	useEffect(() => {
		if (account?.id) {
			setSaveErrors([]);
		}
	}, [account?.id]);

	useEffect(() => {
		if (!account?.id) {
			roleSessionRef.current = null;
		} else if (account.id !== roleSessionRef.current && !isRolesLoading) {
			setLocalRoles(currentRoles.map((r) => r.id).filter(Boolean) as string[]);
			roleSessionRef.current = account.id;
		}
	}, [account?.id, currentRoles, isRolesLoading]);

	const isDeleted =
		account?.status?.toUpperCase() === ServiceAccountStatus.Deleted;

	const isDirty =
		account !== null &&
		(localName !== (account.name ?? '') ||
			JSON.stringify([...localRoles].sort()) !==
				JSON.stringify(
					currentRoles
						.map((r) => r.id)
						.filter(Boolean)
						.sort(),
				));

	const {
		roles: availableRoles,
		isLoading: rolesLoading,
		isError: rolesError,
		error: rolesErrorObj,
		refetch: refetchRoles,
	} = useRoles();

	const { data: keysData, isLoading: keysLoading } = useListServiceAccountKeys(
		{ id: selectedAccountId ?? '' },
		{ query: { enabled: !!selectedAccountId } },
	);
	const keys = keysData?.data ?? [];

	useEffect(() => {
		if (keysLoading) {
			return;
		}
		const maxPage = Math.max(1, Math.ceil(keys.length / PAGE_SIZE));
		if (keysPage > maxPage) {
			void setKeysPage(maxPage);
		}
	}, [keysLoading, keys.length, keysPage, setKeysPage]);

	const { mutateAsync: updateMutateAsync } = useUpdateServiceAccount();

	const retryNameUpdate = useCallback(async (): Promise<void> => {
		if (!account) {
			return;
		}
		try {
			await updateMutateAsync({
				pathParams: { id: account.id },
				data: { name: localName },
			});
			setSaveErrors((prev) => prev.filter((e) => e.context !== 'Name update'));
			void refetchAccount();
			void queryClient.invalidateQueries(getListServiceAccountsQueryKey());
		} catch (err) {
			setSaveErrors((prev) =>
				prev.map((e) =>
					e.context === 'Name update' ? { ...e, apiError: toSaveApiError(err) } : e,
				),
			);
		}
	}, [account, localName, updateMutateAsync, refetchAccount, queryClient]);

	const handleNameChange = useCallback((name: string): void => {
		setLocalName(name);
		setSaveErrors((prev) => prev.filter((e) => e.context !== 'Name update'));
	}, []);

	const makeRoleRetry = useCallback(
		(context: string, rawRetry: () => Promise<void>) =>
			async (): Promise<void> => {
				try {
					await rawRetry();
					setSaveErrors((prev) => prev.filter((e) => e.context !== context));
				} catch (err) {
					setSaveErrors((prev) =>
						prev.map((e) =>
							e.context === context ? { ...e, apiError: toSaveApiError(err) } : e,
						),
					);
				}
			},
		[],
	);

	const clearRoleErrors = useCallback((): void => {
		setSaveErrors((prev) =>
			prev.filter(
				(e) => e.context !== 'Roles update' && !e.context.startsWith("Role '"),
			),
		);
	}, []);

	const failuresToSaveErrors = useCallback(
		(failures: RoleUpdateFailure[]): SaveError[] =>
			failures.map((f) => {
				const ctx = `Role '${f.roleName}'`;
				return {
					context: ctx,
					apiError: toSaveApiError(f.error),
					onRetry: makeRoleRetry(ctx, f.onRetry),
				};
			}),
		[makeRoleRetry],
	);

	const retryRolesUpdate = useCallback(async (): Promise<void> => {
		try {
			const failures = await applyDiff([...localRoles], availableRoles);
			if (failures.length === 0) {
				setSaveErrors((prev) => prev.filter((e) => e.context !== 'Roles update'));
			} else {
				setSaveErrors((prev) => {
					const rest = prev.filter((e) => e.context !== 'Roles update');
					return [...rest, ...failuresToSaveErrors(failures)];
				});
			}
		} catch (err) {
			setSaveErrors((prev) =>
				prev.map((e) =>
					e.context === 'Roles update' ? { ...e, apiError: toSaveApiError(err) } : e,
				),
			);
		}
	}, [localRoles, availableRoles, applyDiff, failuresToSaveErrors]);

	const handleSave = useCallback(async (): Promise<void> => {
		if (!account || !isDirty) {
			return;
		}
		setSaveErrors([]);
		setIsSaving(true);
		try {
			const namePromise =
				localName !== (account.name ?? '')
					? updateMutateAsync({
							pathParams: { id: account.id },
							data: { name: localName },
						})
					: Promise.resolve();

			const [nameResult, rolesResult] = await Promise.allSettled([
				namePromise,
				applyDiff([...localRoles], availableRoles),
			]);

			const errors: SaveError[] = [];

			if (nameResult.status === 'rejected') {
				errors.push({
					context: 'Name update',
					apiError: toSaveApiError(nameResult.reason),
					onRetry: retryNameUpdate,
				});
			}

			if (rolesResult.status === 'rejected') {
				errors.push({
					context: 'Roles update',
					apiError: toSaveApiError(rolesResult.reason),
					onRetry: retryRolesUpdate,
				});
			} else {
				errors.push(...failuresToSaveErrors(rolesResult.value));
			}

			if (errors.length > 0) {
				setSaveErrors(errors);
			} else {
				toast.success('Service account updated successfully', {
					position: 'top-right',
				});
				onSuccess({ closeDrawer: false });
			}

			void refetchAccount();
			void queryClient.invalidateQueries(getListServiceAccountsQueryKey());
		} finally {
			setIsSaving(false);
		}
	}, [
		account,
		isDirty,
		localName,
		localRoles,
		availableRoles,
		updateMutateAsync,
		applyDiff,
		refetchAccount,
		onSuccess,
		queryClient,
		retryNameUpdate,
		retryRolesUpdate,
		failuresToSaveErrors,
	]);

	const handleClose = useCallback((): void => {
		setSaveErrors([]);
		void setActiveTab(null);
		void setKeysPage(null);
		void setEditKeyId(null);
		void setIsAddKeyOpen(null);
		void setIsDeleteOpen(null);
		void setSelectedAccountId(null);
	}, [
		setActiveTab,
		setKeysPage,
		setEditKeyId,
		setIsAddKeyOpen,
		setIsDeleteOpen,
		setSelectedAccountId,
	]);

	const footer = useMemo(
		() =>
			activeTab === ServiceAccountDrawerTab.Overview && !isDeleted && open ? (
				<div className="sa-drawer__footer tw:flex tw:w-full tw:flex-wrap tw:items-center tw:justify-between tw:gap-2">
					<AuthZTooltip
						checks={[buildSADeletePermission(selectedAccountId ?? '')]}
						enabled={!!selectedAccountId}
					>
						<ActionButton
							variant="ghost"
							className="tw:text-error-ink tw:hover:bg-error-soft tw:hover:text-error-ink tw:dark:text-error"
							onClick={(): void => {
								void setIsDeleteOpen(true);
							}}
							icon={<Trash2 aria-hidden="true" />}
						>
							Delete Service Account
						</ActionButton>
					</AuthZTooltip>
					<div className="sa-drawer__footer-right tw:ml-auto tw:flex tw:items-center tw:gap-2">
						<Button type="button" variant="outline" onClick={handleClose}>
							Cancel
						</Button>
						<AuthZTooltip
							checks={[
								buildSAReadPermission(selectedAccountId ?? ''),
								buildSAUpdatePermission(selectedAccountId ?? ''),
							]}
							enabled={!!selectedAccountId}
						>
							<ActionButton
								loading={isSaving}
								disabled={!isDirty}
								onClick={handleSave}
							>
								Save Changes
							</ActionButton>
						</AuthZTooltip>
					</div>
				</div>
			) : null,
		[
			activeTab,
			isDeleted,
			open,
			selectedAccountId,
			isSaving,
			isDirty,
			handleClose,
			handleSave,
			setIsDeleteOpen,
		],
	);

	const toolbar = (
		<div className="sa-drawer__tabs tw:flex tw:items-center tw:justify-between tw:gap-2 tw:py-2">
			<SegmentedControl
				label="Service account sections"
				value={activeTab}
				onChange={(val): void => {
					void setActiveTab(val);
					if (val !== ServiceAccountDrawerTab.Keys) {
						void setKeysPage(null);
						void setEditKeyId(null);
					}
				}}
				options={[
					{ value: ServiceAccountDrawerTab.Overview, label: 'Overview' },
					{
						value: ServiceAccountDrawerTab.Keys,
						label: 'Keys',
						count: keys.length > 0 ? keys.length : undefined,
					},
				]}
			/>
			{activeTab === ServiceAccountDrawerTab.Keys && (
				<AuthZTooltip
					checks={[
						APIKeyCreatePermission,
						buildSAAttachPermission(selectedAccountId ?? ''),
					]}
					enabled={!isDeleted && !!selectedAccountId}
				>
					<ActionButton
						variant="outline"
						size="sm"
						disabled={isDeleted}
						onClick={(): void => {
							void setIsAddKeyOpen(true);
						}}
						icon={<Plus aria-hidden="true" />}
					>
						Add Key
					</ActionButton>
				</AuthZTooltip>
			)}
		</div>
	);

	const loadingRows = (
		<div className="tw:flex tw:flex-col tw:gap-3">
			{[0, 1, 2, 3, 4, 5].map((row) => (
				<Skeleton key={row} className="tw:h-5 tw:bg-muted" />
			))}
		</div>
	);

	const body = (
		<div
			className={`sa-drawer__body${
				activeTab === ServiceAccountDrawerTab.Keys ? ' sa-drawer__body--keys' : ''
			}`}
		>
			{isAccountLoading && loadingRows}
			{isAccountError && (
				<ErrorInPlace
					error={toAPIError(
						accountError,
						'An unexpected error occurred while fetching service account details.',
					)}
				/>
			)}
			{!isAccountLoading && !isAccountError && (
				<>
					{activeTab === ServiceAccountDrawerTab.Overview &&
						(account ? (
							<OverviewTab
								account={account}
								localName={localName}
								onNameChange={handleNameChange}
								localRoles={localRoles}
								onRolesChange={(roles): void => {
									setLocalRoles(roles);
									clearRoleErrors();
								}}
								isDisabled={isDeleted}
								availableRoles={availableRoles}
								rolesLoading={rolesLoading}
								rolesError={rolesError}
								rolesErrorObj={rolesErrorObj}
								onRefetchRoles={refetchRoles}
								saveErrors={saveErrors}
							/>
						) : (
							loadingRows
						))}
					{activeTab === ServiceAccountDrawerTab.Keys && (
						<KeysTab
							keys={keys}
							isLoading={keysLoading}
							isDisabled={isDeleted}
							accountId={selectedAccountId ?? ''}
							currentPage={keysPage}
							pageSize={PAGE_SIZE}
							onPageChange={(page): void => {
								void setKeysPage(page);
							}}
						/>
					)}
				</>
			)}
		</div>
	);

	return (
		<SideSheet
			open={open}
			onClose={handleClose}
			modal={false}
			title="Service Account Details"
			className="sa-drawer"
			testId="service-account-drawer"
			width={640}
			toolbar={open ? toolbar : undefined}
			footer={footer}
		>
			{open && (
				<>
					{body}
					<DeleteAccountModal />
					<AddKeyModal />
				</>
			)}
		</SideSheet>
	);
}

export default ServiceAccountDrawer;
