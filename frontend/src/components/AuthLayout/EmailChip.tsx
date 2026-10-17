import {
	AUTH_FIELD_CLASS,
	AUTH_LABEL_CLASS,
	AUTH_LINK_CLASS,
} from './classNames';

interface EmailChipProps {
	email: string;
	onChange: () => void;
}

function EmailChip({ email, onChange }: EmailChipProps): JSX.Element {
	return (
		<div className={AUTH_FIELD_CLASS}>
			<span className={AUTH_LABEL_CLASS}>Email</span>
			<div
				data-testid="login-email-chip"
				className="tw:flex tw:h-11 tw:items-center tw:justify-between tw:gap-3 tw:rounded-md tw:border tw:border-border tw:bg-muted tw:pr-1.5 tw:pl-3"
			>
				<span className="tw:truncate">{email}</span>
				<button
					type="button"
					onClick={onChange}
					aria-label="Change email"
					className={`${AUTH_LINK_CLASS} tw:px-1.5`}
				>
					Change
				</button>
			</div>
		</div>
	);
}

export default EmailChip;
