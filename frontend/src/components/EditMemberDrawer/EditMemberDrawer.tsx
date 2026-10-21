import { useCallback, useEffect, useRef, useState } from 'react';
import { useCopyToClipboard } from 'react-use';
import { toast } from '@signozhq/ui/sonner';
import { convertToApiError } from 'api/ErrorResponseHandlerForGeneratedAPIs';
import type { RenderErrorResponseDTO } from 'api/generated/services/fuseScope.schemas';
import {
	useCreateResetPasswordToken,
	useDeleteUser,
	useGetResetPasswordToken,
	useGetUser,
	useUpdateMyUserV2,
	useUpdateUser,
} from 'api/generated/services/users';
import { AxiosError } from 'axios';
import MemberStatusBadge from 'components/MembersTable/MemberStatusBadge';
import { MemberRow } from 'components/MembersTable/MembersTable';
import SideSheet from 'components/PageTemplate/components/SideSheet';
import { Button } from 'components/ui/button';
import { Input } from 'components/ui/input';
import { Skeleton } from 'components/ui/skeleton';
import RolesSelect, { useRoles } from 'components/RolesSelect';
import SaveErrorItem from 'components/ServiceAccountDrawer/SaveErrorItem';
import type { SaveError } from 'components/ServiceAccountDrawer/utils';
import { DATE_TIME_FORMATS } from 'constants/dateTimeFormats';
import { MemberStatus } from 'container/MembersSettings/utils';
import {
	MemberRoleUpdateFailure,
	useMemberRoleManager,
} from 'hooks/member/useMemberRoleManager';
import { useAppContext } from 'providers/App/App';
import { useErrorModal } from 'providers/ErrorModalProvider';
import { useTimezone } from 'providers/Timezone';
import APIError from 'types/api/error';
import { getAbsoluteUrl } from 'utils/basePath';
import { toAPIError } from 'utils/errorUtils';
import { RefreshCw, Trash2 } from 'lucide-react';
import ActionButton from 'pages/Settings/components/ActionButton';
import DrawerField from 'pages/Settings/components/DrawerField';
import LockedValue from 'pages/Settings/components/LockedValue';

import DeleteMemberDialog from './DeleteMemberDialog';
import ResetLinkDialog from './ResetLinkDialog';

const ROOT_USER_TOOLTIP = 'This operation is not supported for the root user';
const SELF_DELETE_TOOLTIP =
	'You cannot perform this action on your own account';

function getDeleteTooltip(
	isRootUser: boolean,
	isSelf: boolean,
): string | undefined {
	if (isRootUser) {
		return ROOT_USER_TOOLTIP;
	}
	if (isSelf) {
		return SELF_DELETE_TOOLTIP;
	}
	return undefined;
}

function getInviteButtonLabel(
	isLoading: boolean,
	existingToken: { expiresAt?: string } | undefined,
	isExpired: boolean,
	notFound: boolean,
): string {
	if (isLoading) {
		return 'Checking invite...';
	}
	if (existingToken && !isExpired) {
		return 'Copy Invite Link';
	}
	if (isExpired) {
		return 'Regenerate Invite Link';
	}
	if (notFound) {
		return 'Generate Invite Link';
	}
	return 'Copy Invite Link';
}

function toSaveApiError(err: unknown): APIError {
	return (
		convertToApiError(err as AxiosError<RenderErrorResponseDTO>) ??
		toAPIError(err as AxiosError<RenderErrorResponseDTO>)
	);
}

export interface EditMemberDrawerProps {
	member: MemberRow | null;
	open: boolean;
	onClose: () => void;
	onComplete: () => void;
}

// eslint-disable-next-line sonarjs/cognitive-complexity
function EditMemberDrawer({
	member,
	open,
	onClose,
	onComplete,
}: EditMemberDrawerProps): JSX.Element {
	const { formatTimezoneAdjustedTimestamp } = useTimezone();
	const { user: currentUser } = useAppContext();

	const [localDisplayName, setLocalDisplayName] = useState('');
	const [localRoles, setLocalRoles] = useState<string[]>([]);
	const [isSaving, setIsSaving] = useState(false);
	const [saveErrors, setSaveErrors] = useState<SaveError[]>([]);
	const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
	const [resetLink, setResetLink] = useState<string | null>(null);
	const [resetLinkExpiresAt, setResetLinkExpiresAt] = useState<string | null>(
		null,
	);
	const [showResetLinkDialog, setShowResetLinkDialog] = useState(false);
	const [hasCopiedResetLink, setHasCopiedResetLink] = useState(false);
	const [linkType, setLinkType] = useState<'invite' | 'reset' | null>(null);

	const isInvited = member?.status === MemberStatus.Invited;
	const isDeleted = member?.status === MemberStatus.Deleted;
	const isSelf = !!member?.id && member.id === currentUser?.id;

	const { showErrorModal } = useErrorModal();

	const {
		data: fetchedUser,
		isLoading: isFetchingUser,
		refetch: refetchUser,
	} = useGetUser(
		{ id: member?.id ?? '' },
		{ query: { enabled: open && !!member?.id } },
	);

	const isRootUser = !!fetchedUser?.data?.isRoot;

	const {
		roles: availableRoles,
		isLoading: rolesLoading,
		isError: rolesError,
		error: rolesErrorObj,
		refetch: refetchRoles,
	} = useRoles();

	const {
		currentRoles: currentMemberRoles,
		isLoading: isMemberRolesLoading,
		applyDiff,
	} = useMemberRoleManager(member?.id ?? '', open && !!member?.id);

	// Token status query for invited users
	const {
		data: tokenQueryData,
		isLoading: isLoadingTokenStatus,
		isError: tokenNotFound,
	} = useGetResetPasswordToken(
		{ id: member?.id ?? '' },
		{ query: { enabled: open && !!member?.id && isInvited } },
	);

	const existingToken = tokenQueryData?.data;
	const isTokenExpired =
		existingToken != null &&
		new Date(String(existingToken.expiresAt)) < new Date();

	// Create/regenerate token mutation
	const { mutateAsync: createTokenMutation, isLoading: isGeneratingLink } =
		useCreateResetPasswordToken();

	const fetchedDisplayName =
		fetchedUser?.data?.displayName ?? member?.name ?? '';
	const fetchedUserId = fetchedUser?.data?.id;
	const fetchedUserDisplayName = fetchedUser?.data?.displayName;

	const roleSessionRef = useRef<string | null>(null);

	useEffect(() => {
		if (fetchedUserId) {
			setLocalDisplayName(fetchedUserDisplayName ?? member?.name ?? '');
		}
	}, [fetchedUserId, fetchedUserDisplayName, member?.name]);

	useEffect(() => {
		if (fetchedUserId) {
			setSaveErrors([]);
		}
	}, [fetchedUserId]);

	useEffect(() => {
		if (!member?.id) {
			roleSessionRef.current = null;
		} else if (member.id !== roleSessionRef.current && !isMemberRolesLoading) {
			setLocalRoles(
				currentMemberRoles.map((r) => r.id).filter(Boolean) as string[],
			);
			roleSessionRef.current = member.id;
		}
	}, [member?.id, currentMemberRoles, isMemberRolesLoading]);

	const isDirty =
		member !== null &&
		fetchedUser != null &&
		(localDisplayName !== fetchedDisplayName ||
			JSON.stringify([...localRoles].sort()) !==
				JSON.stringify(
					currentMemberRoles
						.map((r) => r.id)
						.filter(Boolean)
						.sort(),
				));

	const { mutateAsync: updateMyUser } = useUpdateMyUserV2();
	const { mutateAsync: updateUser } = useUpdateUser();

	const { mutate: deleteUser, isLoading: isDeleting } = useDeleteUser({
		mutation: {
			onSuccess: (): void => {
				toast.success(
					isInvited ? 'Invite revoked successfully' : 'Member deleted successfully',
					{ position: 'top-right' },
				);
				setShowDeleteConfirm(false);
				onComplete();
				onClose();
			},
			onError: (err): void => {
				const errMessage = convertToApiError(
					err as AxiosError<RenderErrorResponseDTO, unknown> | null,
				);
				showErrorModal(errMessage as APIError);
			},
		},
	});

	const makeRoleRetry = useCallback(
		(context: string, rawRetry: () => Promise<void>) =>
			async (): Promise<void> => {
				try {
					await rawRetry();
					setSaveErrors((prev) => prev.filter((e) => e.context !== context));
					void refetchUser();
				} catch (err) {
					setSaveErrors((prev) =>
						prev.map((e) =>
							e.context === context ? { ...e, apiError: toSaveApiError(err) } : e,
						),
					);
				}
			},
		[refetchUser],
	);

	const retryNameUpdate = useCallback(async (): Promise<void> => {
		if (!member) {
			return;
		}
		try {
			if (isSelf) {
				await updateMyUser({ data: { displayName: localDisplayName } });
			} else {
				await updateUser({
					pathParams: { id: member.id },
					data: { displayName: localDisplayName },
				});
			}
			setSaveErrors((prev) => prev.filter((e) => e.context !== 'Name update'));
			void refetchUser();
		} catch (err) {
			setSaveErrors((prev) =>
				prev.map((e) =>
					e.context === 'Name update' ? { ...e, apiError: toSaveApiError(err) } : e,
				),
			);
		}
	}, [member, isSelf, localDisplayName, updateMyUser, updateUser, refetchUser]);

	const handleSave = useCallback(async (): Promise<void> => {
		if (!member || !isDirty) {
			return;
		}
		setSaveErrors([]);
		setIsSaving(true);
		try {
			const nameChanged = localDisplayName !== fetchedDisplayName;
			const rolesChanged =
				JSON.stringify([...localRoles].sort()) !==
				JSON.stringify(
					currentMemberRoles
						.map((r) => r.id)
						.filter(Boolean)
						.sort(),
				);

			const namePromise = nameChanged
				? isSelf
					? updateMyUser({ data: { displayName: localDisplayName } })
					: updateUser({
							pathParams: { id: member.id },
							data: { displayName: localDisplayName },
						})
				: Promise.resolve();

			const [nameResult, rolesResult] = await Promise.allSettled([
				namePromise,
				rolesChanged
					? applyDiff([...localRoles], availableRoles)
					: Promise.resolve([]),
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
					onRetry: async (): Promise<void> => {
						const failures = await applyDiff([...localRoles], availableRoles);
						setSaveErrors((prev) => {
							const rest = prev.filter((e) => e.context !== 'Roles update');
							return [
								...rest,
								...failures.map((f: MemberRoleUpdateFailure) => {
									const ctx = `Role '${f.roleName}'`;
									return {
										context: ctx,
										apiError: toSaveApiError(f.error),
										onRetry: makeRoleRetry(ctx, f.onRetry),
									};
								}),
							];
						});
						void refetchUser();
					},
				});
			} else {
				for (const failure of rolesResult.value ?? []) {
					const context = `Role '${failure.roleName}'`;
					errors.push({
						context,
						apiError: toSaveApiError(failure.error),
						onRetry: makeRoleRetry(context, failure.onRetry),
					});
				}
			}

			if (errors.length > 0) {
				setSaveErrors(errors);
			} else {
				toast.success('Member details updated successfully');
				onComplete();
			}

			void refetchUser();
		} finally {
			setIsSaving(false);
		}
	}, [
		member,
		isDirty,
		isSelf,
		localDisplayName,
		localRoles,
		fetchedDisplayName,
		currentMemberRoles,
		updateMyUser,
		updateUser,
		applyDiff,
		availableRoles,
		refetchUser,
		retryNameUpdate,
		makeRoleRetry,
		onComplete,
	]);

	const handleDelete = useCallback((): void => {
		if (!member) {
			return;
		}
		deleteUser({ pathParams: { id: member.id } });
	}, [member, deleteUser]);

	const handleGenerateResetLink = useCallback(async (): Promise<void> => {
		if (!member) {
			return;
		}
		try {
			const response = await createTokenMutation({
				pathParams: { id: member.id },
			});
			if (response?.data?.token) {
				const link = getAbsoluteUrl(`/password-reset?token=${response.data.token}`);
				setResetLink(link);
				setResetLinkExpiresAt(
					response.data.expiresAt
						? formatTimezoneAdjustedTimestamp(
								String(response.data.expiresAt),
								DATE_TIME_FORMATS.DASH_DATETIME,
							)
						: null,
				);
				setHasCopiedResetLink(false);
				setLinkType(isInvited ? 'invite' : 'reset');
				setShowResetLinkDialog(true);
				onClose();
			} else {
				toast.error('Failed to generate password reset link', {
					position: 'top-right',
				});
			}
		} catch (err) {
			const errMsg = convertToApiError(
				err as AxiosError<RenderErrorResponseDTO, unknown> | null,
			);
			showErrorModal(errMsg as APIError);
		}
	}, [member, isInvited, onClose, showErrorModal, createTokenMutation]);

	const [copyState, copyToClipboard] = useCopyToClipboard();
	const handleCopyResetLink = useCallback((): void => {
		if (!resetLink) {
			return;
		}
		copyToClipboard(resetLink);
		setHasCopiedResetLink(true);
		setTimeout(() => setHasCopiedResetLink(false), 2000);
		const message =
			linkType === 'invite'
				? 'Invite link copied to clipboard'
				: 'Reset link copied to clipboard';
		toast.success(message);
	}, [resetLink, copyToClipboard, linkType]);

	useEffect(() => {
		if (copyState.error) {
			toast.error('Failed to copy link');
		}
	}, [copyState.error]);

	const handleClose = useCallback((): void => {
		setShowDeleteConfirm(false);
		onClose();
	}, [onClose]);

	const joinedOnLabel = isInvited ? 'Invited On' : 'Joined On';

	const formatTimestamp = useCallback(
		(ts: string | null | undefined): string => {
			if (!ts) {
				return '—';
			}
			const d = new Date(ts);
			if (Number.isNaN(d.getTime())) {
				return '—';
			}
			return formatTimezoneAdjustedTimestamp(ts, DATE_TIME_FORMATS.DASH_DATETIME);
		},
		[formatTimezoneAdjustedTimestamp],
	);

	const statusForBadge =
		member?.status === MemberStatus.Active ||
		member?.status === MemberStatus.Deleted
			? member.status
			: MemberStatus.Invited;

	const rolesLockedReason = isRootUser
		? ROOT_USER_TOOLTIP
		: isDeleted
			? undefined
			: 'You cannot modify your own role';

	const drawerBody = isFetchingUser ? (
		<div className="tw:flex tw:flex-col tw:gap-3">
			{[0, 1, 2, 3, 4, 5].map((row) => (
				<Skeleton key={row} className="tw:h-5 tw:bg-muted" />
			))}
		</div>
	) : (
		<div className="edit-member-drawer__body tw:flex tw:flex-col tw:gap-5">
			<DrawerField label="Name" htmlFor="member-name">
				<Input
					id="member-name"
					value={localDisplayName}
					title={isRootUser ? ROOT_USER_TOOLTIP : undefined}
					onChange={(e): void => {
						setLocalDisplayName(e.target.value);
						setSaveErrors((prev) =>
							prev.filter((err) => err.context !== 'Name update'),
						);
					}}
					placeholder="Enter name"
					disabled={isRootUser || isDeleted}
				/>
			</DrawerField>

			<DrawerField label="Email Address" htmlFor="member-email">
				<LockedValue>
					<span className="edit-member-drawer__email-text tw:truncate">
						{member?.email || '—'}
					</span>
				</LockedValue>
			</DrawerField>

			<DrawerField label="Roles" htmlFor="member-role">
				{isSelf || isRootUser || isDeleted ? (
					<LockedValue title={rolesLockedReason}>
						<div className="edit-member-drawer__disabled-roles tw:flex tw:flex-wrap tw:gap-1.5">
							{localRoles.length > 0 ? (
								localRoles.map((roleId) => {
									const role = availableRoles.find((r) => r.id === roleId);
									return (
										<span
											key={roleId}
											className="tw:inline-flex tw:h-5 tw:items-center tw:rounded-sm tw:bg-muted tw:px-2 tw:text-xs tw:font-medium tw:text-foreground"
										>
											{role?.name ?? roleId}
										</span>
									);
								})
							) : (
								<span className="edit-member-drawer__email-text">—</span>
							)}
						</div>
					</LockedValue>
				) : (
					<RolesSelect
						id="member-role"
						mode="multiple"
						roles={availableRoles}
						loading={rolesLoading}
						isError={rolesError}
						error={rolesErrorObj}
						onRefetch={refetchRoles}
						value={localRoles}
						onChange={(roles): void => {
							setLocalRoles(roles);
							setSaveErrors((prev) =>
								prev.filter(
									(err) =>
										err.context !== 'Roles update' && !err.context.startsWith("Role '"),
								),
							);
						}}
						placeholder="Select roles"
					/>
				)}
			</DrawerField>

			<dl className="edit-member-drawer__meta tw:grid tw:grid-cols-[140px_1fr] tw:gap-x-4 tw:gap-y-3 tw:rounded-lg tw:border tw:border-border tw:px-4 tw:py-3 tw:text-[13px]">
				<dt className="tw:text-muted-foreground">Status</dt>
				<dd>
					<MemberStatusBadge status={statusForBadge} />
				</dd>

				<dt className="tw:text-muted-foreground">{joinedOnLabel}</dt>
				<dd className="tw:text-foreground tw:tabular-nums">
					{formatTimestamp(member?.joinedOn)}
				</dd>
				{!isInvited && (
					<>
						<dt className="tw:text-muted-foreground">Last Modified</dt>
						<dd className="tw:text-foreground tw:tabular-nums">
							{formatTimestamp(member?.updatedAt)}
						</dd>
					</>
				)}
			</dl>

			{saveErrors.length > 0 && (
				<div className="edit-member-drawer__save-errors tw:flex tw:flex-col tw:gap-2">
					{saveErrors.map((e) => (
						<SaveErrorItem
							key={e.context}
							context={e.context}
							apiError={e.apiError}
							onRetry={e.onRetry}
						/>
					))}
				</div>
			)}
		</div>
	);

	const resetLinkLabel = isGeneratingLink
		? 'Generating...'
		: isInvited
			? getInviteButtonLabel(
					isLoadingTokenStatus,
					existingToken,
					isTokenExpired,
					tokenNotFound,
				)
			: 'Generate Password Reset Link';

	const footer = isDeleted ? null : (
		<div className="edit-member-drawer__footer tw:flex tw:w-full tw:flex-wrap tw:items-center tw:justify-between tw:gap-2">
			<div className="edit-member-drawer__footer-left tw:flex tw:flex-wrap tw:items-center tw:gap-1">
				<ActionButton
					variant="ghost"
					className="tw:text-error-ink tw:hover:bg-error-soft tw:hover:text-error-ink tw:dark:text-error"
					disabledReason={getDeleteTooltip(isRootUser, isSelf)}
					onClick={(): void => setShowDeleteConfirm(true)}
					disabled={isRootUser || isSelf}
					icon={<Trash2 aria-hidden="true" />}
				>
					<span className="translate-safe">
						{isInvited ? 'Revoke Invite' : 'Delete Member'}
					</span>
				</ActionButton>

				<ActionButton
					variant="ghost"
					disabledReason={ROOT_USER_TOOLTIP}
					onClick={handleGenerateResetLink}
					disabled={isRootUser}
					loading={isGeneratingLink || isLoadingTokenStatus}
					icon={<RefreshCw aria-hidden="true" />}
				>
					<span className="translate-safe">{resetLinkLabel}</span>
				</ActionButton>
			</div>

			<div className="edit-member-drawer__footer-right tw:ml-auto tw:flex tw:items-center tw:gap-2">
				<Button type="button" variant="outline" onClick={handleClose}>
					Cancel
				</Button>

				<ActionButton
					disabledReason={isRootUser ? ROOT_USER_TOOLTIP : 'No changes to save'}
					disabled={!isDirty || isRootUser}
					onClick={handleSave}
					loading={isSaving}
				>
					<span className="translate-safe">
						{isSaving ? 'Saving...' : 'Save Member Details'}
					</span>
				</ActionButton>
			</div>
		</div>
	);

	return (
		<>
			<SideSheet
				open={open}
				onClose={handleClose}
				modal={false}
				title="Member Details"
				footer={footer}
				width={560}
				testId="edit-member-drawer"
				className="edit-member-drawer"
			>
				{drawerBody}
			</SideSheet>

			<ResetLinkDialog
				open={showResetLinkDialog}
				linkType={linkType}
				resetLink={resetLink}
				expiresAt={resetLinkExpiresAt}
				hasCopied={hasCopiedResetLink}
				onClose={(): void => {
					setShowResetLinkDialog(false);
				}}
				onCopy={handleCopyResetLink}
			/>

			<DeleteMemberDialog
				open={showDeleteConfirm}
				isInvited={isInvited}
				member={member}
				isDeleting={isDeleting}
				onClose={(): void => setShowDeleteConfirm(false)}
				onConfirm={handleDelete}
			/>
		</>
	);
}

export default EditMemberDrawer;
