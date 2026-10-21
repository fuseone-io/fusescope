import { useState } from 'react';
import logEvent from 'api/common/logEvent';
import { ErrorResponseHandlerV2 } from 'api/ErrorResponseHandlerV2';
import {
	updateMyPassword,
	useUpdateMyUserV2,
} from 'api/generated/services/users';
import { toast } from '@signozhq/ui/sonner';
import { Button } from 'components/ui/button';
import { KeyRound, Mail, PencilLine, User } from 'lucide-react';
import { useAppContext } from 'providers/App/App';
import { useErrorModal } from 'providers/ErrorModalProvider';
import APIError from 'types/api/error';
import { ErrorV2Resp } from 'types/api';
import { AxiosError } from 'axios';

import ResetPasswordDialog from './ResetPasswordDialog';
import UpdateNameDialog from './UpdateNameDialog';

function UserInfo(): JSX.Element {
	const { user, org, updateUser } = useAppContext();

	const { showErrorModal } = useErrorModal();
	const { mutateAsync: updateMyUser } = useUpdateMyUserV2();

	const [currentPassword, setCurrentPassword] = useState<string>('');
	const [updatePassword, setUpdatePassword] = useState<string>('');
	const [isLoading, setIsLoading] = useState<boolean>(false);

	const [changedName, setChangedName] = useState<string>(
		user?.displayName || '',
	);

	const [isUpdateNameModalOpen, setIsUpdateNameModalOpen] =
		useState<boolean>(false);
	const [isResetPasswordModalOpen, setIsResetPasswordModalOpen] =
		useState<boolean>(false);

	if (!user) {
		return <div />;
	}

	const hideUpdateNameModal = (): void => {
		setIsUpdateNameModalOpen(false);
	};

	const hideResetPasswordModal = (): void => {
		setIsResetPasswordModalOpen(false);
		setCurrentPassword('');
		setUpdatePassword('');
	};

	const onChangePasswordClickHandler = async (): Promise<void> => {
		try {
			setIsLoading(true);

			await updateMyPassword({
				newPassword: updatePassword,
				oldPassword: currentPassword,
			});
			toast.success('Password updated successfully');
			hideResetPasswordModal();
			setIsLoading(false);
		} catch (error) {
			setIsLoading(false);
			try {
				ErrorResponseHandlerV2(error as AxiosError<ErrorV2Resp>);
			} catch (apiError) {
				showErrorModal(apiError as APIError);
			}
		}
	};

	const passwordsMatch =
		currentPassword.length > 0 &&
		updatePassword.length > 0 &&
		currentPassword === updatePassword;

	const isResetPasswordDisabled =
		isLoading ||
		currentPassword.length === 0 ||
		updatePassword.length === 0 ||
		passwordsMatch;

	const onSaveHandler = async (): Promise<void> => {
		void logEvent('Account Settings: Name Updated', {
			name: changedName,
		});
		void logEvent(
			'Account Settings: Name Updated',
			{
				name: changedName,
			},
			'identify',
		);
		try {
			setIsLoading(true);
			await updateMyUser({ data: { displayName: changedName } });

			toast.success('Name updated successfully');
			updateUser({
				...user,
				displayName: changedName,
			});
			setIsLoading(false);
			hideUpdateNameModal();
		} catch (error) {
			try {
				ErrorResponseHandlerV2(error as AxiosError<ErrorV2Resp>);
			} catch (apiError) {
				showErrorModal(apiError as APIError);
			}
		}
		setIsLoading(false);
	};

	if (!user || !org) {
		return <div />;
	}

	return (
		<div className="user-info-card fs-ui tw:flex tw:flex-wrap tw:items-center tw:gap-4 tw:px-5 tw:py-4 tw:font-sans">
			<span
				aria-hidden="true"
				className="tw:flex tw:size-10 tw:flex-none tw:items-center tw:justify-center tw:rounded-full tw:bg-primary-soft tw:text-sm tw:font-semibold tw:text-primary-ink"
			>
				{(user.displayName || user.email).charAt(0).toUpperCase()}
			</span>
			<div className="user-info tw:flex tw:min-w-0 tw:flex-1 tw:flex-col tw:gap-1">
				<div className="user-name tw:truncate tw:text-sm tw:font-semibold tw:text-foreground">
					{user.displayName}
				</div>

				<div className="user-info-subsection tw:flex tw:flex-wrap tw:gap-x-5 tw:gap-y-1 tw:text-[13px] tw:text-muted-foreground tw:[&_svg]:size-3.5">
					<span className="user-email tw:inline-flex tw:items-center tw:gap-1.5">
						<Mail aria-hidden="true" /> {user.email}
					</span>

					<span className="user-role tw:inline-flex tw:items-center tw:gap-1.5 tw:capitalize">
						<User aria-hidden="true" /> {user.role.toLowerCase()}
					</span>
				</div>
			</div>

			<div className="user-info-update-section tw:flex tw:flex-wrap tw:gap-2">
				<Button
					type="button"
					variant="outline"
					onClick={(): void => setIsUpdateNameModalOpen(true)}
				>
					<PencilLine aria-hidden="true" />
					Update name
				</Button>

				<Button
					type="button"
					variant="outline"
					onClick={(): void => setIsResetPasswordModalOpen(true)}
				>
					<KeyRound aria-hidden="true" />
					Reset password
				</Button>
			</div>

			<UpdateNameDialog
				open={isUpdateNameModalOpen}
				name={changedName}
				isLoading={isLoading}
				onNameChange={setChangedName}
				onClose={hideUpdateNameModal}
				onSave={(): void => {
					void onSaveHandler();
				}}
			/>

			<ResetPasswordDialog
				open={isResetPasswordModalOpen}
				currentPassword={currentPassword}
				newPassword={updatePassword}
				isLoading={isLoading}
				isDisabled={isResetPasswordDisabled}
				passwordsMatch={passwordsMatch}
				onCurrentPasswordChange={setCurrentPassword}
				onNewPasswordChange={setUpdatePassword}
				onClose={hideResetPasswordModal}
				onSubmit={(): void => {
					void onChangePasswordClickHandler();
				}}
			/>
		</div>
	);
}

export default UserInfo;
