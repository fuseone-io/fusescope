import { cn } from 'lib/utils';

interface SegmentedOption {
	label: string;
	value: string;
}

interface SegmentedControlProps {
	label: string;
	value: string;
	options: SegmentedOption[];
	onChange: (value: string) => void;
	disabled?: boolean;
	size?: 'sm' | 'md';
	className?: string;
}

/** A row of toggle buttons where exactly one is pressed. */
function SegmentedControl({
	label,
	value,
	options,
	onChange,
	disabled,
	size = 'md',
	className,
}: SegmentedControlProps): JSX.Element {
	return (
		<div
			role="group"
			aria-label={label}
			className={cn(
				'fs-ui tw:inline-flex tw:flex-wrap tw:gap-0.5 tw:rounded-lg tw:border tw:border-border tw:bg-surface-sunken tw:p-0.5 tw:font-sans',
				className,
			)}
		>
			{options.map((option) => (
				<button
					key={option.value}
					type="button"
					aria-pressed={option.value === value}
					disabled={disabled}
					onClick={(): void => onChange(option.value)}
					className={cn(
						'tw:inline-flex tw:cursor-pointer tw:items-center tw:rounded-md tw:border tw:border-transparent tw:bg-transparent tw:font-medium tw:text-muted-foreground tw:hover:text-foreground tw:focus-visible:outline-2 tw:focus-visible:outline-ring tw:disabled:cursor-not-allowed tw:disabled:opacity-60',
						'tw:aria-pressed:border-border tw:aria-pressed:bg-surface-raised tw:aria-pressed:text-foreground tw:aria-pressed:shadow-xs',
						size === 'sm'
							? 'tw:h-6 tw:px-2 tw:text-xs'
							: 'tw:h-7 tw:px-2.5 tw:text-[13px]',
					)}
				>
					{option.label}
				</button>
			))}
		</div>
	);
}

export default SegmentedControl;
