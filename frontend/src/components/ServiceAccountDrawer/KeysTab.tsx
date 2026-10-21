import { useCallback } from 'react';
import type { ServiceaccounttypesGettableFactorAPIKeyDTO } from 'api/generated/services/fuseScope.schemas';
import { Skeleton } from 'components/ui/skeleton';
import { fuseScopeDocsUrl } from 'constants/docs';
import AuthZTooltip from 'lib/authz/components/AuthZTooltip/AuthZTooltip';
import { withAuthZContent } from 'lib/authz/components/withAuthZ/withAuthZContent';
import {
	APIKeyCreatePermission,
	APIKeyListPermission,
	buildSAAttachPermission,
} from 'lib/authz/hooks/useAuthZ/permissions/service-account.permissions';
import { KeyRound, Plus } from 'lucide-react';
import { parseAsBoolean, parseAsString, useQueryState } from 'nuqs';
import ActionButton from 'pages/Settings/components/ActionButton';
import { useTimezone } from 'providers/Timezone';

import EditKeyModal from './EditKeyModal';
import KeysTable from './KeysTable';
import RevokeKeyModal from './RevokeKeyModal';
import { formatLastObservedAt } from './utils';

interface KeysTabProps {
	keys: ServiceaccounttypesGettableFactorAPIKeyDTO[];
	isLoading: boolean;
	isDisabled?: boolean;
	accountId?: string;
	currentPage: number;
	pageSize: number;
	onPageChange: (page: number) => void;
}

function LoadingRows(): JSX.Element {
	return (
		<div
			data-testid="keys-tab-loading"
			className="keys-tab__loading tw:flex tw:flex-col tw:gap-3"
		>
			{[0, 1, 2, 3].map((row) => (
				<Skeleton key={row} className="tw:h-5 tw:bg-muted" />
			))}
		</div>
	);
}

function KeysTab({
	keys,
	isLoading,
	isDisabled = false,
	accountId = '',
	currentPage,
	pageSize,
	onPageChange,
}: KeysTabProps): JSX.Element {
	const [, setIsAddKeyOpen] = useQueryState(
		'add-key',
		parseAsBoolean.withDefault(false),
	);
	const { formatTimezoneAdjustedTimestamp } = useTimezone();
	const [editKeyId, setEditKeyId] = useQueryState(
		'edit-key',
		parseAsString.withDefault(''),
	);
	const [, setRevokeKeyId] = useQueryState(
		'revoke-key',
		parseAsString.withDefault(''),
	);
	const editKey = keys.find((k) => k.id === editKeyId) ?? null;

	const handleformatLastObservedAt = useCallback(
		(lastObservedAt: string | Date | null | undefined): string =>
			formatLastObservedAt(lastObservedAt, formatTimezoneAdjustedTimestamp),
		[formatTimezoneAdjustedTimestamp],
	);

	const onRevokeClick = useCallback(
		(keyId: string): void => {
			void setRevokeKeyId(keyId);
		},
		[setRevokeKeyId],
	);

	if (isLoading) {
		return <LoadingRows />;
	}

	if (keys.length === 0) {
		return (
			<div className="keys-tab__empty fs-ui tw:flex tw:flex-col tw:items-center tw:gap-3 tw:rounded-lg tw:border tw:border-dashed tw:border-border tw:px-6 tw:py-10 tw:text-center tw:font-sans">
				<span className="tw:flex tw:size-10 tw:items-center tw:justify-center tw:rounded-full tw:bg-surface-sunken tw:text-muted-foreground">
					<KeyRound className="keys-tab__empty-icon tw:size-5" aria-hidden="true" />
				</span>
				<p className="keys-tab__empty-text tw:text-[13px] tw:text-muted-foreground">
					No keys. Start by creating one.{' '}
					<a
						href={fuseScopeDocsUrl(
							'/administration/service-accounts/#create-a-service-account-and-key',
						)}
						target="_blank"
						rel="noopener noreferrer"
						className="keys-tab__learn-more tw:text-primary-ink tw:hover:underline"
					>
						Learn more
					</a>
				</p>
				<AuthZTooltip
					checks={[APIKeyCreatePermission, buildSAAttachPermission(accountId)]}
					enabled={!isDisabled && !!accountId}
				>
					<ActionButton
						variant="outline"
						icon={<Plus aria-hidden="true" />}
						onClick={async (): Promise<void> => {
							await setIsAddKeyOpen(true);
						}}
						disabled={isDisabled}
					>
						Add your first key
					</ActionButton>
				</AuthZTooltip>
			</div>
		);
	}

	return (
		<>
			<KeysTable
				keys={keys}
				isDisabled={isDisabled}
				accountId={accountId}
				currentPage={currentPage}
				pageSize={pageSize}
				onPageChange={onPageChange}
				onEdit={(keyId): void => {
					void setEditKeyId(keyId);
				}}
				onRevoke={onRevokeClick}
				formatLastObservedAt={handleformatLastObservedAt}
			/>

			<EditKeyModal keyItem={editKey} />

			<RevokeKeyModal />
		</>
	);
}

export default withAuthZContent(KeysTab, {
	checks: [APIKeyListPermission],
	fallbackOnLoading: <LoadingRows />,
});
