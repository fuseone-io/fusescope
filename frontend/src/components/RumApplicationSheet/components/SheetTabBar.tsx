import { ReactNode } from 'react';
import { Tabs as TabsPrimitive } from 'radix-ui';

import { SheetTab } from '../types';

export interface SheetTabItem {
	value: SheetTab;
	label: ReactNode;
	disabled?: boolean;
	title?: string;
}

interface SheetTabBarProps {
	label: string;
	tabs: SheetTabItem[];
	value: SheetTab;
	onChange: (tab: SheetTab) => void;
}

const TABS: SheetTab[] = ['settings', 'key', 'install'];
const isSheetTab = (value: string): value is SheetTab =>
	TABS.includes(value as SheetTab);

function SheetTabBar({
	label,
	tabs,
	value,
	onChange,
}: SheetTabBarProps): JSX.Element {
	return (
		<TabsPrimitive.Root
			value={value}
			onValueChange={(next): void => {
				if (isSheetTab(next)) {
					onChange(next);
				}
			}}
		>
			<TabsPrimitive.List aria-label={label} className="tw:flex tw:gap-5">
				{tabs.map((tab) => (
					<TabsPrimitive.Trigger
						key={tab.value}
						value={tab.value}
						disabled={tab.disabled}
						title={tab.title}
						data-testid={`rum-sheet-tab-${tab.value}`}
						className="tw:-mb-px tw:inline-flex tw:cursor-pointer tw:items-center tw:gap-1.5 tw:border-0 tw:border-b-2 tw:border-solid tw:border-transparent tw:bg-transparent tw:px-0 tw:py-2.5 tw:text-sm tw:font-medium tw:whitespace-nowrap tw:text-muted-foreground tw:outline-none tw:hover:text-foreground tw:focus-visible:ring-2 tw:focus-visible:ring-ring tw:disabled:cursor-not-allowed tw:disabled:opacity-50 tw:data-[state=active]:border-primary tw:data-[state=active]:text-primary"
					>
						{tab.label}
					</TabsPrimitive.Trigger>
				))}
			</TabsPrimitive.List>
		</TabsPrimitive.Root>
	);
}

export default SheetTabBar;
