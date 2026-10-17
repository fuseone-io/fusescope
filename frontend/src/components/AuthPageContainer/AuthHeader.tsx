import fuseScopeBrandLogoUrl from '@/assets/Logos/fusescope-brand-logo.svg';

import './AuthHeader.styles.scss';

function AuthHeader(): JSX.Element {
	return (
		<header className="auth-header">
			<div className="auth-header-logo">
				<img
					src={fuseScopeBrandLogoUrl}
					alt="FuseScope"
					className="auth-header-logo-icon"
				/>
				<span className="auth-header-logo-text">FuseScope</span>
			</div>
		</header>
	);
}

export default AuthHeader;
