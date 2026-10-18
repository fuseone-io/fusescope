import { useCallback, useMemo, useState } from 'react';
import { Plus, Trash2, X } from '@signozhq/icons';
import { Button } from '@signozhq/ui/button';
import { toast } from '@signozhq/ui/sonner';
import { Modal } from 'antd';
import { ErrorResponseHandlerForGeneratedAPIs } from 'api/ErrorResponseHandlerForGeneratedAPIs';
import {
	useDeleteAuthDomain,
	useListAuthDomains,
} from 'api/generated/services/authdomains';
import {
	AuthtypesGettableAuthDomainDTO,
	RenderErrorResponseDTO,
} from 'api/generated/services/fuseScope.schemas';
import { AxiosError } from 'axios';
import ErrorContent from 'components/ErrorModal/components/ErrorContent';
import Panel from 'components/PageTemplate/components/Panel';
import { useErrorModal } from 'providers/ErrorModalProvider';
import APIError from 'types/api/error';

import AuthDomainTable from './AuthDomainTable';
import CreateEdit from './CreateEdit/CreateEdit';

import './AuthDomain.styles.scss';
import '../../IngestionSettings/IngestionSettings.styles.scss';

export { SSOType } from './utils';

function AuthDomain(): JSX.Element {
	const [record, setRecord] = useState<AuthtypesGettableAuthDomainDTO>();
	const [addDomain, setAddDomain] = useState<boolean>(false);
	const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
	const [activeDomain, setActiveDomain] =
		useState<AuthtypesGettableAuthDomainDTO | null>(null);

	const { showErrorModal } = useErrorModal();

	const {
		data: authDomainListResponse,
		isLoading: isLoadingAuthDomainListResponse,
		isFetching: isFetchingAuthDomainListResponse,
		error: errorFetchingAuthDomainListResponse,
		refetch: refetchAuthDomainListResponse,
	} = useListAuthDomains();

	const { mutate: deleteAuthDomain, isLoading } =
		useDeleteAuthDomain<AxiosError<RenderErrorResponseDTO>>();

	const showDeleteModal = useCallback(
		(domain: AuthtypesGettableAuthDomainDTO): void => {
			setActiveDomain(domain);
			setIsDeleteModalOpen(true);
		},
		[],
	);

	const hideDeleteModal = useCallback((): void => {
		setIsDeleteModalOpen(false);
		setActiveDomain(null);
	}, []);

	const handleDeleteDomain = useCallback((): void => {
		if (!activeDomain?.id) {
			return;
		}

		deleteAuthDomain(
			{ pathParams: { id: activeDomain.id } },
			{
				onSuccess: () => {
					toast.success('Domain deleted successfully');
					void refetchAuthDomainListResponse();
					hideDeleteModal();
				},
				onError: (error) => {
					try {
						ErrorResponseHandlerForGeneratedAPIs(error);
					} catch (apiError) {
						showErrorModal(apiError as APIError);
					}
				},
			},
		);
	}, [
		activeDomain,
		deleteAuthDomain,
		hideDeleteModal,

		refetchAuthDomainListResponse,
		showErrorModal,
	]);

	const formattedError = useMemo(() => {
		if (!errorFetchingAuthDomainListResponse) {
			return null;
		}

		let errorResult: APIError | null = null;
		try {
			ErrorResponseHandlerForGeneratedAPIs(errorFetchingAuthDomainListResponse);
		} catch (error) {
			errorResult = error as APIError;
		}
		return errorResult;
	}, [errorFetchingAuthDomainListResponse]);

	return (
		<Panel
			title={<span data-testid="auth-domain-title">Authenticated Domains</span>}
			actions={
				<Button
					prefix={<Plus size="md" />}
					onClick={(): void => {
						setAddDomain(true);
					}}
					variant="solid"
					size="sm"
					color="primary"
					testId="auth-domain-add"
				>
					Add Domain
				</Button>
			}
			className="auth-domain tw:overflow-hidden"
			bodyClassName="tw:mt-3 tw:border-t tw:border-border"
		>
			{formattedError && (
				<div className="tw:p-5">
					<ErrorContent error={formattedError} />
				</div>
			)}
			{!errorFetchingAuthDomainListResponse && (
				<AuthDomainTable
					domains={authDomainListResponse?.data ?? []}
					loading={
						isLoadingAuthDomainListResponse || isFetchingAuthDomainListResponse
					}
					onConfigure={setRecord}
					onDelete={showDeleteModal}
				/>
			)}
			{(addDomain || record) && (
				<CreateEdit
					isCreate={!record}
					record={record}
					onClose={(): void => {
						setAddDomain(false);
						setRecord(undefined);
						refetchAuthDomainListResponse();
					}}
				/>
			)}

			<Modal
				className="delete-ingestion-key-modal auth-domain-delete-modal"
				title={<span className="title">Delete Domain</span>}
				open={isDeleteModalOpen}
				closable
				onCancel={hideDeleteModal}
				destroyOnClose
				footer={[
					<Button
						size="md"
						variant="solid"
						color="secondary"
						key="cancel"
						onClick={hideDeleteModal}
						prefix={<X size={16} />}
						testId="auth-domain-delete-cancel"
					>
						Cancel
					</Button>,
					<Button
						size="md"
						variant="solid"
						color="danger"
						key="submit"
						prefix={<Trash2 size={16} />}
						onClick={handleDeleteDomain}
						loading={isLoading}
						testId="auth-domain-delete-confirm"
					>
						Delete Domain
					</Button>,
				]}
			>
				<p className="delete-text">
					Are you sure you want to delete the domain{' '}
					<strong>{activeDomain?.name}</strong>? This action cannot be undone.
				</p>
			</Modal>
		</Panel>
	);
}

export default AuthDomain;
