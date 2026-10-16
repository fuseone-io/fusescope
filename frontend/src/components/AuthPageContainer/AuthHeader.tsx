import { useCallback } from 'react';
import { Button } from '@signozhq/ui/button';
import { LifeBuoy } from '@signozhq/icons';

import fuseScopeBrandLogoUrl from '@/assets/Logos/fusescope-brand-logo.svg';

import './AuthHeader.styles.scss';

function AuthHeader(): JSX.Element {
	const handleGetHelp = useCallback((): void => {
		window.open('https://signoz.io/support/', '_blank');
	}, []);

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
			<Button
				size="md"
				prefix={<LifeBuoy size={12} />}
				onClick={handleGetHelp}
				variant="solid"
				color="secondary"
			>
				Get Help
			</Button>
		</header>
	);
}

export default AuthHeader;
