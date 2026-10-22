import { ReactNode } from 'react';
import { cn } from 'lib/utils';

interface FieldProps {
	label: ReactNode;
	htmlFor?: string;
	description?: ReactNode;
	error?: ReactNode;
	children: ReactNode;
	className?: string;
}

function Field({
	label,
	htmlFor,
	description,
	error,
	children,
	className,
}: FieldProps): JSX.Element {
	const labelClass =
		'tw:flex tw:items-center tw:gap-1.5 tw:text-[13px] tw:font-medium tw:text-foreground';
	return (
		<div className={cn('tw:flex tw:min-w-0 tw:flex-col tw:gap-1.5', className)}>
			{htmlFor ? (
				<label htmlFor={htmlFor} className={labelClass}>
					{label}
				</label>
			) : (
				<span className={labelClass}>{label}</span>
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

export default Field;
