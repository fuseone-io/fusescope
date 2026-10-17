import { useState } from 'react';

import AuthField from './AuthField';
import PasswordChecklist from './PasswordChecklist';
import PasswordInput from './PasswordInput';

interface NewPasswordFieldsProps {
	password: string;
	confirmPassword: string;
	onPasswordChange: (password: string) => void;
	onConfirmPasswordChange: (confirmPassword: string) => void;
	passwordLabel: string;
	confirmLabel: string;
	disabled?: boolean;
}

/** The mismatch shows once the confirmation has been left, not while typing it. */
function NewPasswordFields({
	password,
	confirmPassword,
	onPasswordChange,
	onConfirmPasswordChange,
	passwordLabel,
	confirmLabel,
	disabled = false,
}: NewPasswordFieldsProps): JSX.Element {
	const [confirmTouched, setConfirmTouched] = useState(false);
	const showMismatch =
		confirmTouched && Boolean(confirmPassword) && password !== confirmPassword;

	return (
		<>
			<AuthField htmlFor="password" label={passwordLabel}>
				<PasswordInput
					id="password"
					data-testid="password"
					autoComplete="new-password"
					required
					value={password}
					disabled={disabled}
					aria-describedby="password-requirements"
					onChange={(event): void => onPasswordChange(event.target.value)}
				/>
				<PasswordChecklist id="password-requirements" password={password} />
			</AuthField>
			<AuthField htmlFor="confirmPassword" label={confirmLabel}>
				<PasswordInput
					id="confirmPassword"
					data-testid="confirmPassword"
					autoComplete="new-password"
					placeholder="Repeat the password"
					required
					value={confirmPassword}
					disabled={disabled}
					aria-invalid={showMismatch || undefined}
					aria-describedby={showMismatch ? 'password-mismatch' : undefined}
					onChange={(event): void => onConfirmPasswordChange(event.target.value)}
					onBlur={(): void => setConfirmTouched(true)}
				/>
				{showMismatch && (
					<span id="password-mismatch" className="tw:text-xs tw:text-error-ink">
						The passwords don&apos;t match.
					</span>
				)}
			</AuthField>
		</>
	);
}

NewPasswordFields.defaultProps = {
	disabled: false,
};

export default NewPasswordFields;
