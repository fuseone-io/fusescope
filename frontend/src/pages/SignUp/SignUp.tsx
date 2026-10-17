import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import AuthError from 'components/AuthError/AuthError';
import AuthButton from 'components/AuthLayout/AuthButton';
import AuthField from 'components/AuthLayout/AuthField';
import AuthHeading from 'components/AuthLayout/AuthHeading';
import AuthLayout from 'components/AuthLayout/AuthLayout';
import {
	AUTH_FORM_CLASS,
	AUTH_INPUT_CLASS,
	AUTH_LINK_CLASS,
	AUTH_NOTE_CLASS,
} from 'components/AuthLayout/classNames';
import NewPasswordFields from 'components/AuthLayout/NewPasswordFields';
import { Input } from 'components/ui/input';
import ROUTES from 'constants/routes';
import { cn } from 'lib/utils';

import { useSignUp } from './useSignUp';

function SignUp(): JSX.Element {
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [confirmPassword, setConfirmPassword] = useState('');
	const { loading, formError, submit } = useSignUp();

	const isComplete =
		Boolean(email.trim()) &&
		Boolean(password.trim()) &&
		Boolean(confirmPassword.trim()) &&
		password === confirmPassword;

	const handleSubmit = (event: FormEvent): void => {
		event.preventDefault();
		if (isComplete && !loading) {
			void submit({ email, password });
		}
	};

	return (
		<AuthLayout
			headerAction={
				<>
					Already set up?{' '}
					<Link to={ROUTES.LOGIN} className={cn(AUTH_LINK_CLASS, 'tw:font-normal')}>
						Sign in
					</Link>
				</>
			}
		>
			<form
				className={cn(AUTH_FORM_CLASS, 'tw:gap-5')}
				aria-labelledby="signup-title"
				onSubmit={handleSubmit}
				noValidate
			>
				<AuthHeading
					id="signup-title"
					title="Create the admin account"
					description="This is the first account on this FuseScope installation, so it gets the Admin role."
				/>
				<AuthField htmlFor="signupEmail" label="Work email">
					<Input
						id="signupEmail"
						data-testid="email"
						type="email"
						autoComplete="email"
						placeholder="you@company.com"
						autoFocus
						required
						value={email}
						disabled={loading}
						onChange={(event): void => setEmail(event.target.value)}
						className={AUTH_INPUT_CLASS}
					/>
				</AuthField>
				<NewPasswordFields
					password={password}
					confirmPassword={confirmPassword}
					onPasswordChange={setPassword}
					onConfirmPasswordChange={setConfirmPassword}
					passwordLabel="Password"
					confirmLabel="Confirm password"
					disabled={loading}
				/>
				<AuthButton
					type="submit"
					data-testid="signup-submit"
					data-attr="signup"
					loading={loading}
					disabled={!isComplete}
				>
					Create account and continue
				</AuthButton>
				{formError && <AuthError error={formError} />}
				<p className={AUTH_NOTE_CLASS}>
					Everyone else joins by invite from Settings → Members, or through single
					sign-on once you set it up.
				</p>
			</form>
		</AuthLayout>
	);
}

export default SignUp;
