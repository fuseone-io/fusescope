import { ReactNode } from 'react';
import { Label } from 'components/ui/label';

import { AUTH_FIELD_CLASS, AUTH_LABEL_CLASS } from './classNames';

interface AuthFieldProps {
	htmlFor: string;
	label: string;
	/** Rendered on the label's line, right-aligned. */
	action?: ReactNode;
	children: ReactNode;
}

function AuthField({
	htmlFor,
	label,
	action,
	children,
}: AuthFieldProps): JSX.Element {
	return (
		<div className={AUTH_FIELD_CLASS}>
			<div className="tw:flex tw:items-baseline tw:justify-between">
				<Label htmlFor={htmlFor} className={AUTH_LABEL_CLASS}>
					{label}
				</Label>
				{action}
			</div>
			{children}
		</div>
	);
}

AuthField.defaultProps = {
	action: undefined,
};

export default AuthField;
