import { ReactNode } from 'react';
import { cn } from 'lib/utils';
import { Tabs as TabsPrimitive } from 'radix-ui';

import { PageTab } from '../types';

interface HeaderBandTabsLayoutProps {
	/** Usually a `CompactPageHeader`. */
	header: ReactNode;
	/** Accessible name of the tab list. */
	label: string;
	tabs: PageTab[];
	value: string;
	onValueChange: (value: string) => void;
	/** Above every tab's content, e.g. the page's filter row. */
	toolbar?: ReactNode;
	testId?: string;
}

/**
 * `HeaderBandLayout` with controlled tabs at the bottom of the band, for pages
 * whose sections are a query param (see `useQueryParamTab`) rather than
 * routes. Only the active tab's content is mounted.
 */
function HeaderBandTabsLayout({
	header,
	label,
	tabs,
	value,
	onValueChange,
	toolbar,
	testId,
}: HeaderBandTabsLayoutProps): JSX.Element {
	return (
		<TabsPrimitive.Root
			value={value}
			onValueChange={onValueChange}
			data-testid={testId}
			className="tw:flex tw:min-h-full tw:w-full tw:flex-col tw:bg-background tw:text-foreground"
		>
			<div className="tw:flex tw:flex-none tw:flex-col tw:gap-2 tw:border-b tw:border-border tw:bg-surface-raised tw:px-4 tw:pt-4 tw:md:px-6">
				{header}
				<TabsPrimitive.List
					aria-label={label}
					className="fs-ui tw:flex tw:gap-6 tw:overflow-x-auto tw:overflow-y-hidden tw:font-sans"
				>
					{tabs.map((tab) => (
						<TabsPrimitive.Trigger
							key={tab.value}
							value={tab.value}
							data-testid={`page-tab-${tab.value}`}
							className="tw:-mb-px tw:inline-flex tw:cursor-pointer tw:items-center tw:gap-1.5 tw:border-b-2 tw:border-transparent tw:py-2.5 tw:text-sm tw:font-medium tw:whitespace-nowrap tw:text-muted-foreground! tw:transition-colors tw:outline-none tw:hover:text-foreground! tw:focus-visible:ring-2 tw:focus-visible:ring-ring tw:focus-visible:ring-inset tw:data-[state=active]:border-primary tw:data-[state=active]:text-primary!"
						>
							{tab.label}
							{tab.badge}
						</TabsPrimitive.Trigger>
					))}
				</TabsPrimitive.List>
			</div>
			<div className="tw:flex tw:min-w-0 tw:flex-1 tw:flex-col tw:gap-4 tw:px-4 tw:pt-4 tw:pb-8 tw:md:px-6">
				{toolbar}
				{tabs.map((tab) => (
					<TabsPrimitive.Content
						key={tab.value}
						value={tab.value}
						className={cn('tw:min-w-0 tw:outline-none')}
					>
						{tab.content}
					</TabsPrimitive.Content>
				))}
			</div>
		</TabsPrimitive.Root>
	);
}

export default HeaderBandTabsLayout;
