import AuthButton from 'components/AuthLayout/AuthButton';
import AuthField from 'components/AuthLayout/AuthField';
import { AUTH_LINK_CLASS } from 'components/AuthLayout/classNames';
import PasswordInput from 'components/AuthLayout/PasswordInput';

import { LoginState } from '../types';

type PasswordSectionProps = Pick<
	LoginState,
	'password' | 'setPassword' | 'isSubmitting' | 'onForgotPassword'
>;

function PasswordSection({
	password,
	setPassword,
	isSubmitting,
	onForgotPassword,
}: PasswordSectionProps): JSX.Element {
	return (
		<>
			<AuthField
				htmlFor="currentPassword"
				label="Password"
				action={
					<button
						type="button"
						className={AUTH_LINK_CLASS}
						onClick={onForgotPassword}
					>
						Forgot password?
					</button>
				}
			>
				<PasswordInput
					id="currentPassword"
					data-testid="password"
					autoComplete="current-password"
					autoFocus
					required
					value={password}
					disabled={isSubmitting}
					onChange={(event): void => setPassword(event.target.value)}
				/>
			</AuthField>
			<AuthButton
				type="submit"
				data-testid="password_authn_submit"
				loading={isSubmitting}
				disabled={!password.trim()}
			>
				Sign in
			</AuthButton>
		</>
	);
}

export default PasswordSection;
