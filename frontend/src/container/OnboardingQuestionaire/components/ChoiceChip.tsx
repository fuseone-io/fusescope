import { ReactNode, useId } from 'react';

interface ChoiceChipProps {
	type: 'radio' | 'checkbox';
	name: string;
	value: string;
	checked: boolean;
	onChange: (checked: boolean) => void;
	children: ReactNode;
}

function ChoiceChip({
	type,
	name,
	value,
	checked,
	onChange,
	children,
}: ChoiceChipProps): JSX.Element {
	const labelId = useId();

	return (
		<label className="tw:flex tw:min-h-10 tw:cursor-pointer tw:items-center tw:gap-2.5 tw:rounded-md tw:border tw:border-border tw:bg-background tw:px-3 tw:py-2 tw:text-sm tw:text-foreground tw:transition-colors tw:hover:border-primary tw:has-checked:border-primary tw:has-checked:bg-primary-soft tw:has-checked:text-primary-ink tw:has-focus-visible:ring-[3px] tw:has-focus-visible:ring-ring/50">
			<input
				type={type}
				name={name}
				value={value}
				checked={checked}
				aria-labelledby={labelId}
				onChange={(e): void => onChange(e.target.checked)}
				className="tw:size-4 tw:shrink-0 tw:cursor-pointer tw:accent-primary tw:outline-none"
			/>
			<span id={labelId} className="tw:min-w-0">
				{children}
			</span>
		</label>
	);
}

export default ChoiceChip;
