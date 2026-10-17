import { FormEvent, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-use';
import { convertToApiError } from 'api/ErrorResponseHandlerForGeneratedAPIs';
import { useResetPassword } from 'api/generated/services/users';
import AuthError from 'components/AuthError/AuthError';
import AuthButton from 'components/AuthLayout/AuthButton';
import AuthHeading from 'components/AuthLayout/AuthHeading';
import AuthLayout from 'components/AuthLayout/AuthLayout';
import { AUTH_FORM_CLASS } from 'components/AuthLayout/classNames';
import NewPasswordFields from 'components/AuthLayout/NewPasswordFields';
import ROUTES from 'constants/routes';
import { useNotifications } from 'hooks/useNotifications';
import history from 'lib/history';
import { cn } from 'lib/utils';

function ResetPassword(): JSX.Element {
	const { t } = useTranslation(['common']);
	const { search } = useLocation();
	const token = new URLSearchParams(search).get('token');
	const { notifications } = useNotifications();

	const [password, setPassword] = useState('');
	const [confirmPassword, setConfirmPassword] = useState('');

	const {
		mutate: resetPassword,
		isLoading,
		error: mutationError,
		reset: resetMutation,
	} = useResetPassword();
	const errorMessage = useMemo(
		() => convertToApiError(mutationError),
		[mutationError],
	);

	const isMismatch = Boolean(confirmPassword) && password !== confirmPassword;
	const isComplete =
		Boolean(password.trim()) && Boolean(confirmPassword.trim()) && !isMismatch;

	const clearError = (): void => {
		if (mutationError) {
			resetMutation();
		}
	};

	const handleSubmit = (event: FormEvent): void => {
		event.preventDefault();
		if (!token || !isComplete || isLoading) {
			return;
		}

		resetPassword(
			{ data: { password, token } },
			{
				onSuccess: (): void => {
					notifications.success({ message: t('success', { ns: 'common' }) });
					history.push(ROUTES.LOGIN);
				},
			},
		);
	};

	return (
		<AuthLayout>
			<form
				className={cn(AUTH_FORM_CLASS, 'tw:gap-5')}
				aria-labelledby="reset-title"
				onSubmit={handleSubmit}
				noValidate
			>
				<AuthHeading
					id="reset-title"
					title="Set a new password"
					description="You'll sign in with it next time."
				/>
				<NewPasswordFields
					password={password}
					confirmPassword={confirmPassword}
					onPasswordChange={(value): void => {
						setPassword(value);
						clearError();
					}}
					onConfirmPasswordChange={(value): void => {
						setConfirmPassword(value);
						clearError();
					}}
					passwordLabel="New password"
					confirmLabel="Confirm new password"
				/>
				<AuthButton
					type="submit"
					data-testid="reset-password-submit"
					data-attr="reset-password"
					loading={isLoading}
					disabled={!isComplete}
				>
					Save password
				</AuthButton>
				{errorMessage && !isMismatch && <AuthError error={errorMessage} />}
			</form>
		</AuthLayout>
	);
}

export default ResetPassword;
