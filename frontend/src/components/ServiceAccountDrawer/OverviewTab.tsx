import { useCallback, useEffect, useState } from 'react';
import { useCopyToClipboard } from 'react-use';
import type { AuthtypesGettableRoleDTO } from 'api/generated/services/fuseScope.schemas';
import AuthZTooltip from 'lib/authz/components/AuthZTooltip/AuthZTooltip';
import { withAuthZContent } from 'lib/authz/components/withAuthZ/withAuthZContent';
import StatusBadge from 'components/PageTemplate/components/StatusBadge';
import RolesSelect from 'components/RolesSelect';
import { Button } from 'components/ui/button';
import { Input } from 'components/ui/input';
import { Skeleton } from 'components/ui/skeleton';
import { DATE_TIME_FORMATS } from 'constants/dateTimeFormats';
import { ServiceAccountRow } from 'container/ServiceAccountsSettings/utils';
import {
	buildSAReadPermission,
	buildSAUpdatePermission,
} from 'lib/authz/hooks/useAuthZ/permissions/service-account.permissions';
import { useTimezone } from 'providers/Timezone';
import APIError from 'types/api/error';

import { Check, Copy } from 'lucide-react';
import DrawerField from 'pages/Settings/components/DrawerField';
import LockedValue from 'pages/Settings/components/LockedValue';

import SaveErrorItem from './SaveErrorItem';
import type { SaveError } from './utils';

interface OverviewTabProps {
	account: ServiceAccountRow;
	localName: string;
	onNameChange: (v: string) => void;
	localRoles: string[];
	onRolesChange: (v: string[]) => void;
	isDisabled: boolean;
	availableRoles: AuthtypesGettableRoleDTO[];
	rolesLoading?: boolean;
	rolesError?: boolean;
	rolesErrorObj?: APIError | undefined;
	onRefetchRoles?: () => void;
	saveErrors?: SaveError[];
}

function OverviewTab({
	account,
	localName,
	onNameChange,
	localRoles,
	onRolesChange,
	isDisabled,
	availableRoles,
	rolesLoading,
	rolesError,
	rolesErrorObj,
	onRefetchRoles,
	saveErrors = [],
}: OverviewTabProps): JSX.Element {
	const { formatTimezoneAdjustedTimestamp } = useTimezone();
	const [, copyToClipboard] = useCopyToClipboard();
	const [hasCopiedId, setHasCopiedId] = useState(false);

	const handleCopyId = useCallback((): void => {
		if (account.id) {
			copyToClipboard(account.id);
			setHasCopiedId(true);
		}
	}, [account.id, copyToClipboard]);

	useEffect(() => {
		if (hasCopiedId) {
			const timer = setTimeout(() => setHasCopiedId(false), 2000);
			return (): void => clearTimeout(timer);
		}
		return undefined;
	}, [hasCopiedId]);

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

	const status = account.status?.toUpperCase();

	const roleChips =
		localRoles.length > 0 ? (
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
			<span className="sa-drawer__input-text">—</span>
		);

	return (
		<div className="tw:flex tw:flex-col tw:gap-5">
			<DrawerField label="Name" htmlFor="sa-name">
				{isDisabled ? (
					<AuthZTooltip
						checks={[buildSAUpdatePermission(account.id)]}
						withPortal={false}
					>
						<LockedValue>
							<span className="sa-drawer__input-text tw:truncate">
								{localName || '—'}
							</span>
						</LockedValue>
					</AuthZTooltip>
				) : (
					<AuthZTooltip
						checks={[buildSAUpdatePermission(account.id)]}
						withPortal={false}
						triggerClassName="tw:w-full"
					>
						<Input
							id="sa-name"
							value={localName}
							onChange={(e): void => onNameChange(e.target.value)}
							placeholder="Enter name"
						/>
					</AuthZTooltip>
				)}
			</DrawerField>

			<DrawerField label="ID" htmlFor="sa-id">
				<LockedValue
					actions={
						account.id && (
							<Button
								type="button"
								variant="ghost"
								size="icon-xs"
								onClick={handleCopyId}
								data-testid="copy-id-btn"
								aria-label={hasCopiedId ? 'Copied' : 'Copy ID'}
							>
								{hasCopiedId ? <Check /> : <Copy />}
							</Button>
						)
					}
				>
					<span className="sa-drawer__input-text tw:truncate tw:font-mono tw:text-xs">
						{account.id || '—'}
					</span>
				</LockedValue>
			</DrawerField>

			<DrawerField label="Email Address" htmlFor="sa-email">
				<LockedValue>
					<span className="sa-drawer__input-text tw:truncate">
						{account.email || '—'}
					</span>
				</LockedValue>
			</DrawerField>

			<DrawerField label="Roles" htmlFor="sa-roles">
				{isDisabled ? (
					<LockedValue>
						<div className="sa-drawer__disabled-roles tw:flex tw:flex-wrap tw:gap-1.5">
							{roleChips}
						</div>
					</LockedValue>
				) : (
					<RolesSelect
						id="sa-roles"
						mode="multiple"
						roles={availableRoles}
						loading={rolesLoading}
						isError={rolesError}
						error={rolesErrorObj}
						onRefetch={onRefetchRoles}
						value={localRoles}
						onChange={onRolesChange}
						placeholder="Select roles"
					/>
				)}
			</DrawerField>

			<dl className="sa-drawer__meta tw:grid tw:grid-cols-[140px_1fr] tw:gap-x-4 tw:gap-y-3 tw:rounded-lg tw:border tw:border-border tw:px-4 tw:py-3 tw:text-[13px]">
				<dt className="tw:text-muted-foreground">Status</dt>
				<dd>
					{status === 'ACTIVE' && (
						<StatusBadge tone="success" dot>
							ACTIVE
						</StatusBadge>
					)}
					{status === 'DELETED' && (
						<StatusBadge tone="error" dot>
							DELETED
						</StatusBadge>
					)}
					{status !== 'ACTIVE' && status !== 'DELETED' && (
						<StatusBadge tone="neutral">{account.status || 'UNKNOWN'}</StatusBadge>
					)}
				</dd>

				<dt className="tw:text-muted-foreground">Created At</dt>
				<dd className="tw:text-foreground tw:tabular-nums">
					{formatTimestamp(account.createdAt)}
				</dd>

				<dt className="tw:text-muted-foreground">Updated At</dt>
				<dd className="tw:text-foreground tw:tabular-nums">
					{formatTimestamp(account.updatedAt)}
				</dd>
			</dl>

			{saveErrors.length > 0 && (
				<div className="sa-drawer__save-errors tw:flex tw:flex-col tw:gap-2">
					{saveErrors.map(({ context, apiError, onRetry }) => (
						<SaveErrorItem
							key={context}
							context={context}
							apiError={apiError}
							onRetry={onRetry}
						/>
					))}
				</div>
			)}
		</div>
	);
}

export default withAuthZContent(OverviewTab, {
	checks: (props): ReturnType<typeof buildSAReadPermission>[] => [
		buildSAReadPermission(props.account.id),
	],
	fallbackOnLoading: <Skeleton className="tw:h-24 tw:bg-muted" />,
});
