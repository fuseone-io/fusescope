import AuthError from 'components/AuthError/AuthError';
import AuthButton from 'components/AuthLayout/AuthButton';
import AuthHeading from 'components/AuthLayout/AuthHeading';
import AuthLayout from 'components/AuthLayout/AuthLayout';
import { AUTH_FORM_CLASS } from 'components/AuthLayout/classNames';
import ROUTES from 'constants/routes';
import history from 'lib/history';
import { CircleAlert } from 'lucide-react';
import APIError from 'types/api/error';

interface TokenErrorContent {
	title: string;
	subtitle: string;
}

function getErrorContent(error?: APIError): TokenErrorContent {
	const code = error?.getErrorCode();

	if (code === 'reset_password_token_expired') {
		return {
			title: 'Reset password token is expired',
			subtitle:
				'Password reset links are single-use and expire after a set period. Please request a new password reset link.',
		};
	}

	if (code === 'reset_password_token_not_found') {
		return {
			title: 'Invalid reset link',
			subtitle:
				'This reset password link is invalid or has already been used. Please request a new password reset link.',
		};
	}

	return {
		title: 'Reset link unavailable',
		subtitle:
			'We could not validate your reset password link. Please request a new one.',
	};
}

interface TokenErrorProps {
	error?: APIError;
}

function TokenError({ error }: TokenErrorProps): JSX.Element {
	const { title, subtitle } = getErrorContent(error);

	return (
		<AuthLayout>
			<section className={AUTH_FORM_CLASS} aria-labelledby="token-error-title">
				<span
					aria-hidden="true"
					className="tw:flex tw:size-12 tw:items-center tw:justify-center tw:rounded-lg tw:bg-error-soft tw:text-error-ink"
				>
					<CircleAlert strokeWidth={1.5} className="tw:size-6" />
				</span>
				<AuthHeading id="token-error-title" title={title} description={subtitle} />
				{error && <AuthError error={error} />}
				<AuthButton
					type="button"
					tone="secondary"
					data-testid="back-to-login"
					onClick={(): void => history.push(ROUTES.LOGIN)}
				>
					Back to sign in
				</AuthButton>
			</section>
		</AuthLayout>
	);
}

TokenError.defaultProps = {
	error: undefined,
};

export default TokenError;
