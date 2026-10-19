import { ChangeEvent } from 'react';
import { Input } from 'components/ui/input';
import { cn } from 'lib/utils';

interface FunnelTextFieldProps {
	id: string;
	label: string;
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
	disabled?: boolean;
	multiline?: boolean;
	autoFocus?: boolean;
	error?: string;
}

const FIELD =
	'tw:border-input tw:bg-surface-raised tw:text-[13px] tw:dark:bg-surface-raised';

function FunnelTextField({
	id,
	label,
	value,
	onChange,
	placeholder,
	disabled,
	multiline,
	autoFocus,
	error,
}: FunnelTextFieldProps): JSX.Element {
	const errorId = `${id}-error`;
	const handleChange = (
		e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
	): void => onChange(e.target.value);

	return (
		<div className="tw:flex tw:flex-col tw:gap-1.5">
			<label htmlFor={id} className="tw:text-[13px] tw:text-foreground">
				{label}
			</label>
			{multiline ? (
				<textarea
					id={id}
					value={value}
					onChange={handleChange}
					placeholder={placeholder}
					disabled={disabled}
					autoFocus={autoFocus}
					rows={3}
					className={cn(
						'tw:max-h-[118px] tw:min-h-[76px] tw:w-full tw:resize-none tw:rounded-md tw:border tw:px-3 tw:py-1.5 tw:text-foreground tw:shadow-xs tw:outline-none tw:field-sizing-content tw:placeholder:text-muted-foreground tw:focus-visible:border-ring tw:focus-visible:ring-[3px] tw:focus-visible:ring-ring/50 tw:disabled:cursor-not-allowed tw:disabled:opacity-50',
						FIELD,
					)}
				/>
			) : (
				<Input
					id={id}
					value={value}
					onChange={handleChange}
					placeholder={placeholder}
					disabled={disabled}
					autoFocus={autoFocus}
					aria-invalid={error ? true : undefined}
					aria-describedby={error ? errorId : undefined}
					className={cn('tw:h-8', FIELD)}
				/>
			)}
			{error && (
				<span id={errorId} className="tw:text-xs tw:text-error">
					{error}
				</span>
			)}
		</div>
	);
}

export default FunnelTextField;
