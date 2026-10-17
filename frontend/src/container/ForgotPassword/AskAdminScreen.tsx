import AuthButton from 'components/AuthLayout/AuthButton';
import AuthHeading from 'components/AuthLayout/AuthHeading';
import { AUTH_FORM_CLASS } from 'components/AuthLayout/classNames';
import { UserRoundCog } from 'lucide-react';

interface AskAdminScreenProps {
	onBackToLogin: () => void;
}

function AskAdminScreen({ onBackToLogin }: AskAdminScreenProps): JSX.Element {
	return (
		<section className={AUTH_FORM_CLASS} aria-labelledby="ask-admin-title">
			<span
				aria-hidden="true"
				className="tw:flex tw:size-12 tw:items-center tw:justify-center tw:rounded-lg tw:bg-primary-soft tw:text-primary-ink"
			>
				<UserRoundCog strokeWidth={1.5} className="tw:size-6" />
			</span>
			<AuthHeading
				id="ask-admin-title"
				title="Ask an admin to reset your password"
				description="Self-service password reset is turned off on this FuseScope installation. An admin can create a reset link for you from Settings → Members."
			/>
			<AuthButton
				type="button"
				tone="secondary"
				data-testid="back-to-login"
				onClick={onBackToLogin}
			>
				Back to sign in
			</AuthButton>
		</section>
	);
}

export default AskAdminScreen;
