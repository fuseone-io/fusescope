import { ReactNode } from 'react';
import { Tabs as TabsPrimitive } from 'radix-ui';

export interface EntityDetailTab {
	value: string;
	label: string;
	icon: ReactNode;
}

interface EntityDetailTabsProps {
	tabs: EntityDetailTab[];
	value: string;
	onValueChange: (value: string) => void;
	/** Beside the tabs, e.g. a link to the explorer for the open tab. */
	actions?: ReactNode;
}

/** The detail sheet's views as underlined tabs with icons; contents render outside. */
function EntityDetailTabs({
	tabs,
	value,
	onValueChange,
	actions,
}: EntityDetailTabsProps): JSX.Element {
	return (
		<TabsPrimitive.Root value={value} onValueChange={onValueChange}>
			<div className="fs-ui tw:flex tw:items-end tw:justify-between tw:gap-3 tw:border-b tw:border-border tw:font-sans">
				<TabsPrimitive.List
					aria-label="Resource views"
					className="tw:flex tw:gap-6 tw:overflow-x-auto tw:overflow-y-hidden"
				>
					{tabs.map((tab) => (
						<TabsPrimitive.Trigger
							key={tab.value}
							value={tab.value}
							data-testid={`entity-tab-${tab.value}`}
							className="tw:-mb-px tw:inline-flex tw:cursor-pointer tw:items-center tw:gap-1.5 tw:border-b-2 tw:border-transparent tw:py-2.5 tw:text-sm tw:font-medium tw:whitespace-nowrap tw:text-muted-foreground tw:transition-colors tw:outline-none tw:hover:text-foreground tw:focus-visible:ring-2 tw:focus-visible:ring-ring tw:focus-visible:ring-inset tw:data-[state=active]:border-primary tw:data-[state=active]:text-primary tw:[&_svg]:size-4"
						>
							<span aria-hidden="true" className="tw:inline-flex">
								{tab.icon}
							</span>
							{tab.label}
						</TabsPrimitive.Trigger>
					))}
				</TabsPrimitive.List>
				{actions && (
					<div className="tw:flex tw:items-center tw:gap-2 tw:pb-1.5">{actions}</div>
				)}
			</div>
		</TabsPrimitive.Root>
	);
}

export default EntityDetailTabs;
