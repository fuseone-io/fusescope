import { Controller, useForm } from 'react-hook-form';
import { useQueryClient } from 'react-query';
import { Button } from 'components/ui/button';
import { Input } from 'components/ui/input';
import { Label } from 'components/ui/label';
import { Skeleton } from 'components/ui/skeleton';
import AuthZTooltip from 'lib/authz/components/AuthZTooltip/AuthZTooltip';
import { AuthZGuardContent } from 'lib/authz/components/AuthZGuard/AuthZGuardContent';
import { SACreatePermission } from 'lib/authz/hooks/useAuthZ/permissions/service-account.permissions';
import { toast } from '@signozhq/ui/sonner';
import { convertToApiError } from 'api/ErrorResponseHandlerForGeneratedAPIs';
import {
	invalidateListServiceAccounts,
	useCreateServiceAccount,
} from 'api/generated/services/serviceaccount';
import type { RenderErrorResponseDTO } from 'api/generated/services/fuseScope.schemas';
import { AxiosError } from 'axios';
import { SA_QUERY_PARAMS } from 'container/ServiceAccountsSettings/constants';
import { parseAsBoolean, useQueryState } from 'nuqs';
import { useErrorModal } from 'providers/ErrorModalProvider';
import APIError from 'types/api/error';
import ActionButton from 'pages/Settings/components/ActionButton';
import SettingsDialog from 'pages/Settings/components/SettingsDialog';

interface FormValues {
	name: string;
}

function CreateServiceAccountModal(): JSX.Element {
	const queryClient = useQueryClient();
	const [isOpen, setIsOpen] = useQueryState(
		SA_QUERY_PARAMS.CREATE_SA,
		parseAsBoolean.withDefault(false),
	);
	const [, setSelectedAccountId] = useQueryState(SA_QUERY_PARAMS.ACCOUNT);

	const { showErrorModal, isErrorModalVisible } = useErrorModal();

	const {
		control,
		handleSubmit,
		reset,
		formState: { isValid, errors },
	} = useForm<FormValues>({
		mode: 'onChange',
		defaultValues: {
			name: '',
		},
	});

	const { mutate: createServiceAccount, isLoading: isSubmitting } =
		useCreateServiceAccount({
			mutation: {
				onSuccess: async (response) => {
					toast.success('Service account created successfully');
					reset();
					await setIsOpen(null);
					await invalidateListServiceAccounts(queryClient);
					await setSelectedAccountId(response.data.id);
				},
				onError: (err) => {
					const errMessage = convertToApiError(
						err as AxiosError<RenderErrorResponseDTO, unknown> | null,
					);
					showErrorModal(errMessage as APIError);
				},
			},
		});

	function handleClose(): void {
		reset();
		void setIsOpen(null);
	}

	function handleCreate(values: FormValues): void {
		createServiceAccount({
			data: {
				name: values.name.trim(),
			},
		});
	}

	return (
		<SettingsDialog
			title="New Service Account"
			open={isOpen}
			onOpenChange={(open): void => {
				if (!open) {
					handleClose();
				}
			}}
			width="narrow"
			className="create-sa-modal"
			disableOutsideClick={isErrorModalVisible}
			testId="create-service-account-modal"
			footer={
				<>
					<Button
						type="button"
						variant="outline"
						onClick={handleClose}
						data-testid="create-sa-cancel-btn"
					>
						Cancel
					</Button>

					<AuthZTooltip checks={[SACreatePermission]}>
						<ActionButton
							type="submit"
							form="create-sa-form"
							loading={isSubmitting}
							disabled={!isValid}
							testId="create-sa-submit-btn"
						>
							Create Service Account
						</ActionButton>
					</AuthZTooltip>
				</>
			}
		>
			<AuthZGuardContent
				checks={[SACreatePermission]}
				fallbackOnLoading={<Skeleton className="tw:h-9 tw:bg-muted" />}
			>
				<form
					id="create-sa-form"
					className="create-sa-form tw:flex tw:flex-col tw:gap-2"
					onSubmit={handleSubmit(handleCreate)}
				>
					<Label htmlFor="sa-name" className="tw:text-foreground">
						Name
					</Label>
					<Controller
						name="name"
						control={control}
						rules={{ required: 'Name is required' }}
						render={({ field }): JSX.Element => (
							<Input
								id="sa-name"
								placeholder="Enter a name"
								className="create-sa-form__input"
								value={field.value}
								onChange={field.onChange}
								onBlur={field.onBlur}
								aria-invalid={errors.name ? true : undefined}
								data-testid="create-sa-name-input"
							/>
						)}
					/>
					{errors.name && (
						<p className="create-sa-form__error tw:text-xs tw:text-error-ink tw:dark:text-error">
							{errors.name.message}
						</p>
					)}
				</form>
			</AuthZGuardContent>
		</SettingsDialog>
	);
}

export default CreateServiceAccountModal;
