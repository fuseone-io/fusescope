import { ReactNode } from 'react';
import { cn } from 'lib/utils';

export interface SegmentedOption<T extends string> {
	value: T;
	label: string;
	testId?: string;
	/** A count after the label; `warning` draws it as a badge. */
	count?: number;
	countTone?: 'neutral' | 'warning';
	countTestId?: string;
	/** Not selectable on its own, e.g. a platform that is coming soon. */
	disabled?: boolean;
	title?: string;
	/** After the label, e.g. a "Soon" badge. */
	badge?: ReactNode;
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
						disabled={disabled || option.disabled}
						title={option.title}
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
						{option.count !== undefined && (
							<span
								data-testid={option.countTestId}
								className={cn(
									'tw:tabular-nums',
									option.countTone === 'warning'
										? 'tw:inline-flex tw:h-[18px] tw:items-center tw:rounded-sm tw:bg-warning-soft tw:px-1.5 tw:text-[11px] tw:text-warning-ink'
										: 'tw:text-subtle-foreground',
								)}
							>
								{option.count}
							</span>
						)}
						{option.badge}
					</button>
				);
			})}
		</div>
	);
}

export default SegmentedControl;
