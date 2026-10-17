import { FormEvent } from 'react';
import AuthError from 'components/AuthError/AuthError';
import AuthHeading from 'components/AuthLayout/AuthHeading';
import {
	AUTH_FORM_CLASS,
	AUTH_NOTE_CLASS,
} from 'components/AuthLayout/classNames';
import EmailChip from 'components/AuthLayout/EmailChip';
import OrgPicker from 'components/AuthLayout/OrgPicker';
import { orgDisplayName } from 'components/AuthLayout/utils';

import { LoginState } from '../types';
import { describeOrgAuthN } from '../utils';
import PasswordSection from './PasswordSection';
import SsoSection from './SsoSection';

type CredentialsStepProps = Omit<
	LoginState,
	| 'setEmail'
	| 'isEmailValid'
	| 'isVersionLoading'
	| 'isContextLoading'
	| 'onContinue'
> & { sessionsContext: NonNullable<LoginState['sessionsContext']> };

function headingTitle(
	hasMultipleOrgs: boolean,
	authN: LoginState['authN'],
): string {
	if (hasMultipleOrgs) {
		return 'Choose a workspace';
	}
	if (authN.password) {
		return 'Enter your password';
	}
	if (authN.callbackUrl) {
		return 'Sign in with single sign-on';
	}
	return 'Sign in to FuseScope';
}

function CredentialsStep({
	email,
	password,
	setPassword,
	isSubmitting,
	sessionsContext,
	selectedOrg,
	selectOrg,
	authN,
	error,
	onChangeEmail,
	onPasswordSignIn,
	onSingleSignOn,
	onForgotPassword,
}: CredentialsStepProps): JSX.Element {
	const { orgs } = sessionsContext;
	const hasMultipleOrgs = orgs.length > 1;
	const hasNoSignIn =
		(!hasMultipleOrgs || !!selectedOrg) && !authN.password && !authN.callbackUrl;

	let description: JSX.Element | string | undefined;
	if (hasMultipleOrgs) {
		description = 'Your email belongs to more than one workspace.';
	} else if (selectedOrg) {
		description = (
			<>
				Signing in to the{' '}
				<strong className="tw:font-semibold tw:text-foreground">
					{orgDisplayName(selectedOrg)}
				</strong>{' '}
				workspace.
			</>
		);
	}

	const handleSubmit = (event: FormEvent): void => {
		event.preventDefault();
		if (authN.password && password.trim() && !isSubmitting) {
			void onPasswordSignIn();
		}
	};

	return (
		<form
			className={AUTH_FORM_CLASS}
			aria-labelledby="credentials-title"
			onSubmit={handleSubmit}
			noValidate
		>
			<AuthHeading
				id="credentials-title"
				title={headingTitle(hasMultipleOrgs, authN)}
				description={description}
			/>
			<EmailChip email={email} onChange={onChangeEmail} />
			{hasMultipleOrgs && (
				<OrgPicker
					orgs={orgs}
					value={selectedOrg?.id}
					onChange={selectOrg}
					describe={describeOrgAuthN}
				/>
			)}
			{authN.password && (
				<PasswordSection
					password={password}
					setPassword={setPassword}
					isSubmitting={isSubmitting}
					onForgotPassword={onForgotPassword}
				/>
			)}
			{authN.callbackUrl && (
				<SsoSection
					callbackUrl={authN.callbackUrl}
					secondary={authN.password}
					onSingleSignOn={onSingleSignOn}
				/>
			)}
			{error && <AuthError error={error} />}
			{hasNoSignIn && (
				<p className={AUTH_NOTE_CLASS}>
					No sign-in method is available for this email. Ask an admin for an invite.
				</p>
			)}
		</form>
	);
}

export default CredentialsStep;
