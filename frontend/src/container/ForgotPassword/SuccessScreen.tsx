import AuthButton from 'components/AuthLayout/AuthButton';
import AuthHeading from 'components/AuthLayout/AuthHeading';
import {
	AUTH_FORM_CLASS,
	AUTH_LINK_CLASS,
	AUTH_NOTE_CLASS,
} from 'components/AuthLayout/classNames';
import { Mail } from 'lucide-react';

interface SuccessScreenProps {
	email: string;
	onBackToLogin: () => void;
	onSendAgain: () => void;
}

function SuccessScreen({
	email,
	onBackToLogin,
	onSendAgain,
}: SuccessScreenProps): JSX.Element {
	return (
		<section className={AUTH_FORM_CLASS} aria-labelledby="sent-title">
			<span
				aria-hidden="true"
				className="tw:flex tw:size-12 tw:items-center tw:justify-center tw:rounded-lg tw:bg-primary-soft tw:text-primary-ink"
			>
				<Mail strokeWidth={1.5} className="tw:size-6" />
			</span>
			<AuthHeading
				id="sent-title"
				title="Check your email"
				description={
					<>
						If{' '}
						<strong className="tw:font-semibold tw:text-foreground">{email}</strong>{' '}
						has a FuseScope account, a reset link is on its way. The link works once
						and expires.
					</>
				}
			/>
			<AuthButton
				type="button"
				tone="secondary"
				data-testid="back-to-login"
				onClick={onBackToLogin}
			>
				Back to sign in
			</AuthButton>
			<p className={AUTH_NOTE_CLASS}>
				No email after a few minutes? Check spam, or{' '}
				<button
					type="button"
					className={`${AUTH_LINK_CLASS} tw:font-normal`}
					onClick={onSendAgain}
				>
					send it again
				</button>
				. If your workspace has no email server configured, ask an admin to reset
				your password from Settings → Members.
			</p>
		</section>
	);
}

export default SuccessScreen;
