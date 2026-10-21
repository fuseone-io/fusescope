import { useQueryClient } from 'react-query';
import { Button } from 'components/ui/button';
import AuthZTooltip from 'lib/authz/components/AuthZTooltip/AuthZTooltip';
import { buildSADeletePermission } from 'lib/authz/hooks/useAuthZ/permissions/service-account.permissions';
import { toast } from '@signozhq/ui/sonner';
import { convertToApiError } from 'api/ErrorResponseHandlerForGeneratedAPIs';
import {
	getGetServiceAccountQueryKey,
	invalidateListServiceAccounts,
	useDeleteServiceAccount,
} from 'api/generated/services/serviceaccount';
import type {
	RenderErrorResponseDTO,
	ServiceaccounttypesServiceAccountDTO,
} from 'api/generated/services/fuseScope.schemas';
import { AxiosError } from 'axios';
import { SA_QUERY_PARAMS } from 'container/ServiceAccountsSettings/constants';
import { parseAsBoolean, useQueryState } from 'nuqs';
import { useErrorModal } from 'providers/ErrorModalProvider';
import APIError from 'types/api/error';
import { Trash2 } from 'lucide-react';
import ActionButton from 'pages/Settings/components/ActionButton';
import SettingsDialog from 'pages/Settings/components/SettingsDialog';

function DeleteAccountModal(): JSX.Element {
	const queryClient = useQueryClient();
	const { showErrorModal, isErrorModalVisible } = useErrorModal();
	const [accountId, setAccountId] = useQueryState(SA_QUERY_PARAMS.ACCOUNT);
	const [isDeleteOpen, setIsDeleteOpen] = useQueryState(
		SA_QUERY_PARAMS.DELETE_SA,
		parseAsBoolean.withDefault(false),
	);
	const open = !!isDeleteOpen && !!accountId;

	const cachedAccount = accountId
		? queryClient.getQueryData<{
				data: ServiceaccounttypesServiceAccountDTO;
			}>(getGetServiceAccountQueryKey({ id: accountId }))
		: null;
	const accountName = cachedAccount?.data?.name;

	const { mutate: deleteAccount, isLoading: isDeleting } =
		useDeleteServiceAccount({
			mutation: {
				onSuccess: async () => {
					toast.success('Service account deleted');
					await setIsDeleteOpen(null);
					await setAccountId(null);
					await invalidateListServiceAccounts(queryClient);
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
		if (!accountId) {
			return;
		}
		deleteAccount({
			pathParams: { id: accountId },
		});
	}

	function handleCancel(): void {
		void setIsDeleteOpen(null);
	}

	const content = (
		<p className="sa-delete-dialog__body">
			Are you sure you want to delete{' '}
			<strong className="tw:font-medium tw:text-foreground">{accountName}</strong>?
			This action cannot be undone. All keys associated with this service account
			will be permanently removed.
		</p>
	);

	const footer = (
		<>
			<Button type="button" variant="outline" onClick={handleCancel}>
				Cancel
			</Button>
			<AuthZTooltip
				checks={[buildSADeletePermission(accountId ?? '')]}
				enabled={!!accountId}
			>
				<ActionButton
					variant="destructive"
					loading={isDeleting}
					onClick={handleConfirm}
					data-testid="confirm-delete-btn"
					icon={<Trash2 aria-hidden="true" />}
				>
					Delete
				</ActionButton>
			</AuthZTooltip>
		</>
	);

	return (
		<SettingsDialog
			open={open}
			onOpenChange={(isOpen): void => {
				if (!isOpen) {
					handleCancel();
				}
			}}
			title={`Delete service account ${accountName ?? ''}?`}
			width="narrow"
			className="sa-delete-dialog"
			showCloseButton={false}
			disableOutsideClick={isErrorModalVisible}
			testId="delete-service-account-modal"
			footer={footer}
		>
			{content}
		</SettingsDialog>
	);
}

export default DeleteAccountModal;
