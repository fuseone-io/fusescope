import AuthButton from 'components/AuthLayout/AuthButton';
import { AUTH_NOTE_CLASS } from 'components/AuthLayout/classNames';
import { LogIn } from 'lucide-react';

import { urlHost } from '../utils';

interface SsoSectionProps {
	callbackUrl: string;
	/** Shown under a password sign-in, so it steps back visually. */
	secondary: boolean;
	onSingleSignOn: () => void;
}

function SsoSection({
	callbackUrl,
	secondary,
	onSingleSignOn,
}: SsoSectionProps): JSX.Element {
	const host = urlHost(callbackUrl);

	return (
		<>
			<AuthButton
				type="button"
				data-testid="callback_authn_submit"
				tone={secondary ? 'secondary' : 'primary'}
				onClick={onSingleSignOn}
			>
				<LogIn aria-hidden="true" strokeWidth={1.75} />
				Continue with single sign-on
			</AuthButton>
			{host && (
				<p className={AUTH_NOTE_CLASS}>
					You&apos;ll be redirected to{' '}
					<span className="tw:font-mono tw:text-foreground">{host}</span> to sign in,
					then back to FuseScope.
				</p>
			)}
		</>
	);
}

export default SsoSection;
