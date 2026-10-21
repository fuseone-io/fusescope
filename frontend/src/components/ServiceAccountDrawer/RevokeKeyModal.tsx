import { useQueryClient } from 'react-query';
import { Button } from 'components/ui/button';
import AuthZTooltip from 'lib/authz/components/AuthZTooltip/AuthZTooltip';
import {
	buildAPIKeyDeletePermission,
	buildSADetachPermission,
} from 'lib/authz/hooks/useAuthZ/permissions/service-account.permissions';
import { toast } from '@signozhq/ui/sonner';
import { convertToApiError } from 'api/ErrorResponseHandlerForGeneratedAPIs';
import {
	getListServiceAccountKeysQueryKey,
	invalidateListServiceAccountKeys,
	useRevokeServiceAccountKey,
} from 'api/generated/services/serviceaccount';
import type {
	RenderErrorResponseDTO,
	ServiceaccounttypesGettableFactorAPIKeyDTO,
} from 'api/generated/services/fuseScope.schemas';
import { AxiosError } from 'axios';
import { SA_QUERY_PARAMS } from 'container/ServiceAccountsSettings/constants';
import { parseAsString, useQueryState } from 'nuqs';
import { useErrorModal } from 'providers/ErrorModalProvider';
import APIError from 'types/api/error';
import { Trash2 } from 'lucide-react';
import ActionButton from 'pages/Settings/components/ActionButton';
import SettingsDialog from 'pages/Settings/components/SettingsDialog';

export interface RevokeKeyFooterProps {
	isRevoking: boolean;
	onCancel: () => void;
	onConfirm: () => void;
	accountId?: string;
	keyId?: string;
}

export function RevokeKeyFooter({
	isRevoking,
	onCancel,
	onConfirm,
	accountId,
	keyId,
}: RevokeKeyFooterProps): JSX.Element {
	return (
		<>
			<Button type="button" variant="outline" onClick={onCancel}>
				Cancel
			</Button>
			<AuthZTooltip
				checks={[
					buildAPIKeyDeletePermission(keyId ?? ''),
					buildSADetachPermission(accountId ?? ''),
				]}
				enabled={!!accountId && !!keyId}
			>
				<ActionButton
					variant="destructive"
					loading={isRevoking}
					onClick={onConfirm}
					icon={<Trash2 aria-hidden="true" />}
				>
					Revoke Key
				</ActionButton>
			</AuthZTooltip>
		</>
	);
}

function RevokeKeyModal(): JSX.Element {
	const queryClient = useQueryClient();
	const { showErrorModal, isErrorModalVisible } = useErrorModal();
	const [accountId] = useQueryState(SA_QUERY_PARAMS.ACCOUNT);
	const [revokeKeyId, setRevokeKeyId] = useQueryState(
		SA_QUERY_PARAMS.REVOKE_KEY,
		parseAsString.withDefault(''),
	);
	const open = !!revokeKeyId && !!accountId;

	const cachedKeys = accountId
		? queryClient.getQueryData<{
				data: ServiceaccounttypesGettableFactorAPIKeyDTO[];
			}>(getListServiceAccountKeysQueryKey({ id: accountId }))
		: null;
	const keyName = cachedKeys?.data?.find((k) => k.id === revokeKeyId)?.name;

	const { mutate: revokeKey, isLoading: isRevoking } =
		useRevokeServiceAccountKey({
			mutation: {
				onSuccess: async () => {
					toast.success('Key revoked successfully');
					await setRevokeKeyId(null);
					if (accountId) {
						await invalidateListServiceAccountKeys(queryClient, { id: accountId });
					}
				},
				onError: (error) => {
					showErrorModal(
						convertToApiError(
							error as AxiosError<RenderErrorResponseDTO, unknown> | null,
						) as APIError,
					);
				},
			},
		});

	function handleConfirm(): void {
		if (!revokeKeyId || !accountId) {
			return;
		}
		revokeKey({ pathParams: { id: accountId, fid: revokeKeyId } });
	}

	function handleCancel(): void {
		void setRevokeKeyId(null);
	}

	return (
		<SettingsDialog
			open={open}
			onOpenChange={(isOpen): void => {
				if (!isOpen) {
					handleCancel();
				}
			}}
			title={`Revoke ${keyName ?? 'key'}?`}
			width="narrow"
			className="sa-delete-dialog"
			showCloseButton={false}
			disableOutsideClick={isErrorModalVisible}
			footer={
				<RevokeKeyFooter
					isRevoking={isRevoking}
					onCancel={handleCancel}
					onConfirm={handleConfirm}
					accountId={accountId ?? undefined}
					keyId={revokeKeyId || undefined}
				/>
			}
		>
			<p>
				Revoking this key will permanently invalidate it. Any systems using this key
				will lose access immediately.
			</p>
		</SettingsDialog>
	);
}

export default RevokeKeyModal;
