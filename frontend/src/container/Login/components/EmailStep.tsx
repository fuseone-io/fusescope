import { FormEvent } from 'react';
import AuthError from 'components/AuthError/AuthError';
import AuthButton from 'components/AuthLayout/AuthButton';
import AuthField from 'components/AuthLayout/AuthField';
import AuthHeading from 'components/AuthLayout/AuthHeading';
import {
	AUTH_FORM_CLASS,
	AUTH_INPUT_CLASS,
	AUTH_NOTE_CLASS,
} from 'components/AuthLayout/classNames';
import { Input } from 'components/ui/input';

import { LoginState } from '../types';

type EmailStepProps = Pick<
	LoginState,
	| 'email'
	| 'setEmail'
	| 'isEmailValid'
	| 'isVersionLoading'
	| 'isContextLoading'
	| 'error'
	| 'onContinue'
>;

function EmailStep({
	email,
	setEmail,
	isEmailValid,
	isVersionLoading,
	isContextLoading,
	error,
	onContinue,
}: EmailStepProps): JSX.Element {
	const isLoading = isVersionLoading || isContextLoading;

	const handleSubmit = (event: FormEvent): void => {
		event.preventDefault();
		if (isEmailValid && !isLoading) {
			void onContinue();
		}
	};

	return (
		<form
			className={AUTH_FORM_CLASS}
			aria-labelledby="signin-title"
			onSubmit={handleSubmit}
			noValidate
		>
			<AuthHeading
				id="signin-title"
				title="Sign in to FuseScope"
				description="Enter your work email to continue."
			/>
			<AuthField htmlFor="email" label="Email">
				<Input
					id="email"
					data-testid="email"
					type="email"
					autoComplete="email"
					placeholder="you@company.com"
					required
					autoFocus
					value={email}
					disabled={isVersionLoading}
					onChange={(event): void => setEmail(event.target.value)}
					className={AUTH_INPUT_CLASS}
				/>
			</AuthField>
			<AuthButton
				type="submit"
				data-testid="initiate_login"
				loading={isLoading}
				disabled={!isEmailValid}
			>
				Continue
			</AuthButton>
			{error && <AuthError error={error} />}
			<p className={AUTH_NOTE_CLASS}>
				New team members join through an invite from an admin.
			</p>
		</form>
	);
}

export default EmailStep;
