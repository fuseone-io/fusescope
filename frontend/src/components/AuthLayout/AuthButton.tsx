import { ComponentPropsWithoutRef } from 'react';
import { Button } from 'components/ui/button';
import { cn } from 'lib/utils';
import { LoaderCircle } from 'lucide-react';

import {
	AUTH_PRIMARY_BUTTON_CLASS,
	AUTH_SECONDARY_BUTTON_CLASS,
} from './classNames';

type AuthButtonProps = ComponentPropsWithoutRef<'button'> & {
	loading?: boolean;
	tone?: 'primary' | 'secondary';
};

function AuthButton({
	loading = false,
	tone = 'primary',
	disabled,
	className,
	children,
	...props
}: AuthButtonProps): JSX.Element {
	return (
		<Button
			{...props}
			disabled={disabled || loading}
			aria-busy={loading || undefined}
			className={cn(
				tone === 'primary'
					? AUTH_PRIMARY_BUTTON_CLASS
					: AUTH_SECONDARY_BUTTON_CLASS,
				className,
			)}
		>
			{loading && <LoaderCircle aria-hidden="true" className="tw:animate-spin" />}
			{children}
		</Button>
	);
}

AuthButton.defaultProps = {
	loading: false,
	tone: 'primary',
};

export default AuthButton;
