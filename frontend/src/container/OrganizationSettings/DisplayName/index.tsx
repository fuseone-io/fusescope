import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from '@signozhq/ui/sonner';
import { convertToApiError } from 'api/ErrorResponseHandlerForGeneratedAPIs';
import {
	useGetMyOrganization,
	useUpdateMyOrganization,
} from 'api/generated/services/orgs';
import type { RenderErrorResponseDTO } from 'api/generated/services/fuseScope.schemas';
import { AxiosError } from 'axios';
import { Button } from 'components/ui/button';
import { Input } from 'components/ui/input';
import { Label } from 'components/ui/label';
import { Loader2 } from 'lucide-react';
import { useAppContext } from 'providers/App/App';
import { IUser } from 'providers/App/types';
import { useErrorModal } from 'providers/ErrorModalProvider';
import APIError from 'types/api/error';
import { USER_ROLES } from 'types/roles';
import { requireErrorMessage } from 'utils/form/requireErrorMessage';

function DisplayName({ index, id: orgId }: DisplayNameProps): JSX.Element {
	const { t } = useTranslation(['organizationsettings', 'common']);
	const { showErrorModal } = useErrorModal();
	const { org, updateOrg, user } = useAppContext();
	const currentOrg = (org || [])[index];
	const isAdmin = user.role === USER_ROLES.ADMIN;

	const { data: orgData } = useGetMyOrganization({
		query: {
			enabled: isAdmin && !currentOrg?.displayName,
		},
	});

	const displayName =
		currentOrg?.displayName ?? orgData?.data?.displayName ?? '';

	const { control, handleSubmit, watch, getValues, setValue } =
		useForm<FormValues>({
			defaultValues: { displayName },
		});

	const orgName = watch('displayName');

	useEffect(() => {
		if (displayName && !getValues('displayName')) {
			setValue('displayName', displayName);
		}
	}, [displayName, getValues, setValue]);

	const { mutateAsync: updateMyOrganization, isLoading } =
		useUpdateMyOrganization({
			mutation: {
				onSuccess: (_, { data }) => {
					toast.success(t('success', { ns: 'common' }), {
						position: 'top-right',
					});
					updateOrg(orgId, data?.displayName ?? '');
				},
				onError: (error) => {
					showErrorModal(
						convertToApiError(
							error as AxiosError<RenderErrorResponseDTO>,
						) as APIError,
					);
				},
			},
		});

	const onSubmit = async (values: FormValues): Promise<void> => {
		const { displayName: name } = values;
		await updateMyOrganization({ data: { id: orgId, displayName: name } });
	};

	if (!org) {
		return <div />;
	}

	const isDisabled = isLoading || orgName === displayName || !orgName;

	return (
		<form
			className="display-name-form fs-ui tw:flex tw:flex-wrap tw:items-start tw:gap-3 tw:font-sans"
			onSubmit={handleSubmit(onSubmit)}
			autoComplete="off"
		>
			<div className="form-field tw:flex tw:min-w-[240px] tw:flex-1 tw:flex-col tw:gap-2">
				<Label htmlFor="displayName" className="tw:text-foreground">
					Display name
				</Label>
				<Controller
					name="displayName"
					control={control}
					rules={{ required: requireErrorMessage('Display name') }}
					render={({ field, fieldState }): JSX.Element => (
						<>
							<Input
								{...field}
								id="displayName"
								placeholder={t('signoz')}
								aria-invalid={fieldState.error ? true : undefined}
							/>
							{fieldState.error && (
								<div className="field-error tw:text-xs tw:text-error-ink tw:dark:text-error">
									{fieldState.error.message}
								</div>
							)}
						</>
					)}
				/>
			</div>
			<Button type="submit" disabled={isDisabled} className="tw:mt-6">
				{isLoading && <Loader2 className="tw:animate-spin" aria-hidden="true" />}
				<span className="translate-safe">Submit</span>
			</Button>
		</form>
	);
}

interface DisplayNameProps {
	index: number;
	id: IUser['id'];
}

interface FormValues {
	displayName: string;
}

export default DisplayName;
