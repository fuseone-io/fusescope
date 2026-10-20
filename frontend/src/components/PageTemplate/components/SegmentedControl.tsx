import { cn } from 'lib/utils';

export interface SegmentedOption<T extends string> {
	value: T;
	label: string;
	testId?: string;
}

interface SegmentedControlProps<T extends string> {
	/** Names the group for assistive tech, e.g. "Size tiles by". */
	label: string;
	options: SegmentedOption<T>[];
	value: T;
	onChange: (value: T) => void;
	size?: 'sm' | 'md';
	disabled?: boolean;
	className?: string;
}

/** Two to four mutually exclusive views, as pressed buttons in a sunken track. */
function SegmentedControl<T extends string>({
	label,
	options,
	value,
	onChange,
	size = 'md',
	disabled = false,
	className,
}: SegmentedControlProps<T>): JSX.Element {
	return (
		<div
			role="group"
			aria-label={label}
			className={cn(
				'fs-ui tw:inline-flex tw:flex-none tw:gap-0.5 tw:rounded-lg tw:border tw:border-border tw:bg-surface-sunken tw:p-0.5 tw:font-sans',
				className,
			)}
		>
			{options.map((option) => {
				const pressed = option.value === value;
				return (
					<button
						key={option.value}
						type="button"
						aria-pressed={pressed}
						data-testid={option.testId}
						disabled={disabled}
						onClick={(): void => {
							if (!pressed) {
								onChange(option.value);
							}
						}}
						className={cn(
							'tw:inline-flex tw:cursor-pointer tw:items-center tw:gap-1.5 tw:rounded-md tw:border tw:border-transparent tw:bg-transparent tw:px-2.5 tw:font-medium tw:whitespace-nowrap tw:text-muted-foreground tw:transition-colors tw:outline-none tw:hover:text-foreground tw:focus-visible:ring-2 tw:focus-visible:ring-ring tw:disabled:cursor-not-allowed tw:disabled:opacity-50',
							size === 'sm' ? 'tw:h-6 tw:text-xs' : 'tw:h-7 tw:text-[13px]',
							pressed &&
								'tw:border-border tw:bg-surface-raised tw:text-foreground tw:shadow-xs',
						)}
					>
						{option.label}
					</button>
				);
			})}
		</div>
	);
}

export default SegmentedControl;
