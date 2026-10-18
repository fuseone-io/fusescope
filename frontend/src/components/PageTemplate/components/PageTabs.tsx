import { cn } from 'lib/utils';
import { Tabs as TabsPrimitive } from 'radix-ui';

import { PageTab } from '../types';

interface PageTabsProps {
	/** Accessible name of the tab list. */
	label: string;
	tabs: PageTab[];
	value: string;
	onValueChange: (value: string) => void;
	className?: string;
}

/**
 * Controlled, so the caller can keep the value in the route or a query param
 * (see `useQueryParamTab`). Only the active tab's content is mounted.
 */
function PageTabs({
	label,
	tabs,
	value,
	onValueChange,
	className,
}: PageTabsProps): JSX.Element {
	return (
		<TabsPrimitive.Root
			value={value}
			onValueChange={onValueChange}
			className={cn('tw:flex tw:flex-col tw:gap-6', className)}
		>
			<TabsPrimitive.List
				aria-label={label}
				className="fs-ui tw:flex tw:gap-6 tw:overflow-x-auto tw:overflow-y-hidden tw:font-sans tw:shadow-[inset_0_-1px_0_var(--color-border)]"
			>
				{tabs.map((tab) => (
					<TabsPrimitive.Trigger
						key={tab.value}
						value={tab.value}
						data-testid={`page-tab-${tab.value}`}
						className="tw:inline-flex tw:cursor-pointer tw:items-center tw:gap-1.5 tw:border-b-2 tw:border-transparent tw:py-2.5 tw:text-sm tw:font-medium tw:whitespace-nowrap tw:text-muted-foreground! tw:transition-colors tw:outline-none tw:hover:text-foreground! tw:focus-visible:ring-2 tw:focus-visible:ring-ring tw:focus-visible:ring-inset tw:data-[state=active]:border-primary tw:data-[state=active]:text-primary!"
					>
						{tab.label}
						{tab.badge}
					</TabsPrimitive.Trigger>
				))}
			</TabsPrimitive.List>
			{tabs.map((tab) => (
				<TabsPrimitive.Content
					key={tab.value}
					value={tab.value}
					className="tw:outline-none"
				>
					{tab.content}
				</TabsPrimitive.Content>
			))}
		</TabsPrimitive.Root>
	);
}

export default PageTabs;
