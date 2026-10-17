import { FormEvent, useCallback, useMemo, useState } from 'react';
import { convertToApiError } from 'api/ErrorResponseHandlerForGeneratedAPIs';
import { useForgotPassword } from 'api/generated/services/users';
import AuthError from 'components/AuthError/AuthError';
import AuthButton from 'components/AuthLayout/AuthButton';
import AuthField from 'components/AuthLayout/AuthField';
import AuthHeading from 'components/AuthLayout/AuthHeading';
import {
	AUTH_FORM_CLASS,
	AUTH_INPUT_CLASS,
	AUTH_LINK_CLASS,
	AUTH_NOTE_CLASS,
} from 'components/AuthLayout/classNames';
import OrgPicker from 'components/AuthLayout/OrgPicker';
import { Input } from 'components/ui/input';
import ROUTES from 'constants/routes';
import history from 'lib/history';
import { cn } from 'lib/utils';
import { ChevronLeft } from 'lucide-react';
import { OrgSessionContext } from 'types/api/v2/sessions/context/get';
import { getBaseUrl } from 'utils/basePath';

import AskAdminScreen from './AskAdminScreen';
import SuccessScreen from './SuccessScreen';
import { isSelfServiceResetDisabled } from './utils';

export type ForgotPasswordRouteState = {
	email: string;
	orgId?: string;
	orgs: OrgSessionContext[];
};

function ForgotPassword({
	email,
	orgId,
	orgs,
}: ForgotPasswordRouteState): JSX.Element {
	const {
		mutate: forgotPasswordMutate,
		isLoading,
		isSuccess,
		error: mutationError,
		reset,
	} = useForgotPassword();
	const errorMessage = useMemo(
		() => convertToApiError(mutationError),
		[mutationError],
	);

	const hasMultipleOrgs = orgs.length > 1;
	const [selectedOrgId, setSelectedOrgId] = useState<string | undefined>(
		() => orgId || (orgs.length === 1 ? orgs[0]?.id : undefined),
	);
	const canSubmit = Boolean(email.trim()) && Boolean(selectedOrgId);

	const handleBackToLogin = useCallback((): void => {
		history.push(ROUTES.LOGIN);
	}, []);

	const handleSubmit = (event: FormEvent): void => {
		event.preventDefault();
		if (!canSubmit || !selectedOrgId || isLoading) {
			return;
		}

		forgotPasswordMutate({
			data: { email, orgId: selectedOrgId, frontendBaseURL: getBaseUrl() },
		});
	};

	if (isSuccess) {
		return (
			<SuccessScreen
				email={email}
				onBackToLogin={handleBackToLogin}
				onSendAgain={reset}
			/>
		);
	}

	if (isSelfServiceResetDisabled(errorMessage)) {
		return <AskAdminScreen onBackToLogin={handleBackToLogin} />;
	}

	return (
		<form
			className={AUTH_FORM_CLASS}
			aria-labelledby="forgot-title"
			onSubmit={handleSubmit}
			noValidate
		>
			<button
				type="button"
				data-testid="forgot-password-back"
				onClick={handleBackToLogin}
				className={cn(
					AUTH_LINK_CLASS,
					'tw:inline-flex tw:items-center tw:gap-1.5 tw:self-start',
				)}
			>
				<ChevronLeft aria-hidden="true" strokeWidth={1.75} className="tw:size-4" />
				Back to sign in
			</button>
			<AuthHeading
				id="forgot-title"
				title="Reset your password"
				description="We'll email you a link to choose a new password."
			/>
			<AuthField htmlFor="forgotPasswordEmail" label="Email">
				<Input
					id="forgotPasswordEmail"
					data-testid="email"
					type="email"
					value={email}
					disabled
					readOnly
					className={cn(AUTH_INPUT_CLASS, 'tw:bg-muted tw:disabled:opacity-100')}
				/>
			</AuthField>
			{hasMultipleOrgs && (
				<OrgPicker orgs={orgs} value={selectedOrgId} onChange={setSelectedOrgId} />
			)}
			<AuthButton
				type="submit"
				data-testid="forgot-password-submit"
				loading={isLoading}
				disabled={!canSubmit}
			>
				{isLoading ? 'Sending…' : 'Send reset link'}
			</AuthButton>
			{errorMessage && <AuthError error={errorMessage} />}
			<p className={AUTH_NOTE_CLASS}>
				Signed in with single sign-on? Reset your password with your identity
				provider instead.
			</p>
		</form>
	);
}

export default ForgotPassword;
