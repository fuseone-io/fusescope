import { cn } from 'lib/utils';

interface SheetTab<T extends string> {
	value: T;
	label: string;
}

interface SheetTabsProps<T extends string> {
	label: string;
	tabs: SheetTab<T>[];
	value: T;
	onChange: (value: T) => void;
}

/** Underlined tabs for a sheet's toolbar; the sheet body shows the active one. */
function SheetTabs<T extends string>({
	label,
	tabs,
	value,
	onChange,
}: SheetTabsProps<T>): JSX.Element {
	return (
		<div
			role="tablist"
			aria-label={label}
			className="tw:flex tw:gap-5 tw:overflow-x-auto tw:overflow-y-hidden"
		>
			{tabs.map((tab) => {
				const selected = tab.value === value;
				return (
					<button
						key={tab.value}
						type="button"
						role="tab"
						aria-selected={selected}
						data-testid={`sheet-tab-${tab.value}`}
						onClick={(): void => onChange(tab.value)}
						className={cn(
							'tw:-mb-px tw:inline-flex tw:cursor-pointer tw:items-center tw:border-0 tw:border-b-2 tw:border-solid tw:border-transparent tw:bg-transparent tw:py-2.5 tw:text-[13px] tw:font-medium tw:whitespace-nowrap tw:text-muted-foreground tw:transition-colors tw:outline-none tw:hover:text-foreground tw:focus-visible:ring-2 tw:focus-visible:ring-ring tw:focus-visible:ring-inset',
							selected && 'tw:border-primary tw:text-primary',
						)}
					>
						{tab.label}
					</button>
				);
			})}
		</div>
	);
}

export default SheetTabs;
