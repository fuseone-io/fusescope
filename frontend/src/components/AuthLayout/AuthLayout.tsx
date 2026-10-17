import { ReactNode } from 'react';
import { fuseScopeDocsUrl } from 'constants/docs';

import BrandPanel from './BrandPanel';
import { AUTH_LINK_CLASS } from './classNames';

interface AuthLayoutProps {
	children: ReactNode;
	/** Top-right of the form panel; the docs link when omitted. */
	headerAction?: ReactNode;
}

function AuthLayout({ children, headerAction }: AuthLayoutProps): JSX.Element {
	return (
		<div className="fs-ui tw:flex tw:min-h-screen tw:flex-wrap tw:bg-background tw:font-sans tw:text-sm tw:leading-normal tw:text-foreground tw:antialiased">
			<BrandPanel />
			<main className="tw:flex tw:min-w-0 tw:flex-[999_1_520px] tw:flex-col tw:px-4 tw:py-8 tw:sm:px-10">
				<div className="tw:flex tw:justify-end tw:gap-1.5 tw:text-[13px] tw:text-muted-foreground">
					{headerAction ?? (
						<a
							href={fuseScopeDocsUrl()}
							target="_blank"
							rel="noopener noreferrer"
							className={AUTH_LINK_CLASS}
						>
							Documentation
						</a>
					)}
				</div>
				<div className="tw:flex tw:flex-1 tw:items-center tw:justify-center tw:py-10">
					{children}
				</div>
			</main>
		</div>
	);
}

AuthLayout.defaultProps = {
	headerAction: undefined,
};

export default AuthLayout;
