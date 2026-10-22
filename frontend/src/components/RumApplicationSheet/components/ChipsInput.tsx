import { KeyboardEvent, useState } from 'react';
import { cn } from 'lib/utils';
import { X } from 'lucide-react';

interface ChipsInputProps {
	id: string;
	/** Accessible name of the text box. */
	label: string;
	values: string[];
	onChange: (values: string[]) => void;
	placeholder?: string;
	/** An error for a candidate value, which then is not added. */
	validate?: (value: string) => string | undefined;
	disabled?: boolean;
	mono?: boolean;
	testId?: string;
}

/** A list of strings as removable chips; Enter, comma or blur adds the typed one. */
function ChipsInput({
	id,
	label,
	values,
	onChange,
	placeholder,
	validate,
	disabled = false,
	mono = true,
	testId,
}: ChipsInputProps): JSX.Element {
	const [draft, setDraft] = useState('');
	const [error, setError] = useState<string>();

	const commit = (): boolean => {
		const value = draft.trim();
		if (!value) {
			return false;
		}
		const invalid = validate?.(value);
		if (invalid) {
			setError(invalid);
			return false;
		}
		if (!values.includes(value)) {
			onChange([...values, value]);
		}
		setDraft('');
		setError(undefined);
		return true;
	};

	const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
		if (event.key === 'Enter' || event.key === ',') {
			event.preventDefault();
			commit();
		} else if (event.key === 'Backspace' && !draft && values.length > 0) {
			onChange(values.slice(0, -1));
		}
	};

	return (
		<div className="tw:flex tw:flex-col tw:gap-1">
			<div
				data-testid={testId}
				aria-invalid={Boolean(error)}
				className={cn(
					'tw:flex tw:min-h-9 tw:flex-wrap tw:items-center tw:gap-1.5 tw:rounded-lg tw:border tw:border-input tw:bg-surface-raised tw:px-2 tw:py-1 tw:transition-[box-shadow,border-color] tw:focus-within:border-ring tw:focus-within:ring-[3px] tw:focus-within:ring-ring/30',
					error && 'tw:border-error',
					disabled && 'tw:opacity-60',
				)}
			>
				{values.map((value) => (
					<span
						key={value}
						data-testid={testId ? `${testId}-chip` : undefined}
						className={cn(
							'tw:inline-flex tw:h-6 tw:max-w-full tw:items-center tw:gap-1 tw:rounded-md tw:bg-surface-sunken tw:pr-1 tw:pl-2 tw:text-xs tw:text-foreground',
							mono && 'tw:font-mono',
						)}
					>
						<span className="tw:truncate">{value}</span>
						{!disabled && (
							<button
								type="button"
								aria-label={`Remove ${value}`}
								onClick={(): void => onChange(values.filter((item) => item !== value))}
								className="tw:flex tw:size-4 tw:cursor-pointer tw:items-center tw:justify-center tw:rounded-sm tw:border-0 tw:bg-transparent tw:p-0 tw:text-muted-foreground tw:hover:bg-muted tw:hover:text-foreground"
							>
								<X className="tw:size-3" aria-hidden="true" />
							</button>
						)}
					</span>
				))}
				{!disabled && (
					<input
						id={id}
						aria-label={label}
						value={draft}
						placeholder={values.length === 0 ? placeholder : undefined}
						onChange={(event): void => {
							setDraft(event.target.value);
							setError(undefined);
						}}
						onKeyDown={onKeyDown}
						onBlur={commit}
						data-testid={testId ? `${testId}-input` : undefined}
						className={cn(
							'tw:h-6 tw:min-w-[140px] tw:flex-1 tw:border-0 tw:bg-transparent tw:text-[13px] tw:text-foreground tw:outline-none tw:placeholder:text-subtle-foreground',
							mono && 'tw:font-mono tw:text-xs',
						)}
					/>
				)}
				{disabled && values.length === 0 && (
					<span className="tw:text-[13px] tw:text-subtle-foreground">None</span>
				)}
			</div>
			{error && (
				<span role="alert" className="tw:text-xs tw:text-error">
					{error}
				</span>
			)}
		</div>
	);
}

export default ChipsInput;
