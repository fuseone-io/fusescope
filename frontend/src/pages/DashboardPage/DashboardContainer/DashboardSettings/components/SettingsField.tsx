import { ReactNode } from 'react';
import { cn } from 'lib/utils';

interface SettingsFieldProps {
	label: ReactNode;
	/** Points the label at its control; without it the label is plain text. */
	htmlFor?: string;
	/** Muted text beside the label, e.g. a format. */
	hint?: ReactNode;
	/** Muted text under the control. */
	description?: ReactNode;
	error?: ReactNode;
	children: ReactNode;
	className?: string;
}

/** A labelled control in a settings form. */
function SettingsField({
	label,
	htmlFor,
	hint,
	description,
	error,
	children,
	className,
}: SettingsFieldProps): JSX.Element {
	const labelClass =
		'tw:flex tw:items-center tw:gap-1.5 tw:text-[13px] tw:font-medium tw:text-foreground';
	const labelContent = (
		<>
			{label}
			{hint && (
				<span className="tw:text-xs tw:font-normal tw:text-subtle-foreground">
					{hint}
				</span>
			)}
		</>
	);

	return (
		<div className={cn('tw:flex tw:min-w-0 tw:flex-col tw:gap-1.5', className)}>
			{htmlFor ? (
				<label htmlFor={htmlFor} className={labelClass}>
					{labelContent}
				</label>
			) : (
				<span className={labelClass}>{labelContent}</span>
			)}
			{children}
			{description && (
				<span className="tw:text-xs tw:text-subtle-foreground">{description}</span>
			)}
			{error && (
				<span role="alert" className="tw:text-xs tw:text-error">
					{error}
				</span>
			)}
		</div>
	);
}

export default SettingsField;
