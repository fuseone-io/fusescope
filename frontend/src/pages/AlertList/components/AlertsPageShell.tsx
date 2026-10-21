import { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import {
	showsGlobalTimePicker,
	showsHeaderActionsOnly,
} from 'components/AppHeader/utils';
import HeaderRightSection from 'components/HeaderRightSection/HeaderRightSection';
import CompactPageHeader from 'components/PageTemplate/components/CompactPageHeader';
import { PageTab } from 'components/PageTemplate/types';
import { Bell } from 'lucide-react';
import { Tabs as TabsPrimitive } from 'radix-ui';

import { useAlertsHeaderActionsSlot } from './useAlertsHeaderActionsSlot';

/** Stretches the active panel so tables below can size their pages to it. */
export const FILL_TAB_PANEL =
	'tw:flex-1 tw:[&>[role=tabpanel][data-state=active]]:flex tw:[&>[role=tabpanel][data-state=active]]:flex-1 tw:[&>[role=tabpanel][data-state=active]]:flex-col';

const TAB_TRIGGER_CLASS =
	'tw:-mb-px tw:inline-flex tw:cursor-pointer tw:items-center tw:gap-1.5 tw:border-b-2 tw:border-transparent tw:py-2.5 tw:text-sm tw:font-medium tw:whitespace-nowrap tw:text-muted-foreground! tw:transition-colors tw:outline-none tw:hover:text-foreground! tw:focus-visible:ring-2 tw:focus-visible:ring-ring tw:focus-visible:ring-inset tw:data-[state=active]:border-primary tw:data-[state=active]:text-primary! tw:[&_svg:not([class*=size-])]:size-4';

interface AlertsPageShellProps {
	tabs: PageTab[];
	activeTab: string;
	onTabChange: (tab: string) => void;
	actions?: ReactNode;
	testId?: string;
}

/**
 * The Alerts module: a compact header band with the section tabs, and the
 * active section below. It stretches to the viewport, because the rule and
 * alert tables compute their page size from the height left to them.
 */
function AlertsPageShell({
	tabs,
	activeTab,
	onTabChange,
	actions,
	testId = 'alerts-page',
}: AlertsPageShellProps): JSX.Element {
	const { pathname } = useLocation();
	const setActionsSlot = useAlertsHeaderActionsSlot((s) => s.setSlot);
	const showHeaderRightSection =
		!showsGlobalTimePicker(pathname) && !showsHeaderActionsOnly(pathname);

	return (
		<TabsPrimitive.Root
			value={activeTab}
			onValueChange={onTabChange}
			data-testid={testId}
			className="tw:flex tw:w-full tw:flex-1 tw:flex-col tw:bg-background tw:text-foreground"
		>
			<div className="tw:flex tw:flex-none tw:flex-col tw:gap-2 tw:border-b tw:border-border tw:bg-surface-raised tw:px-4 tw:pt-4 tw:md:px-6">
				<CompactPageHeader
					icon={<Bell />}
					title="Alerts"
					actions={
						<>
							<div
								ref={setActionsSlot}
								data-testid="alerts-header-actions"
								className="fs-ui tw:flex tw:items-center tw:gap-2 tw:font-sans tw:empty:hidden"
							/>
							{actions}
							{showHeaderRightSection && (
								<HeaderRightSection
									enableAnnouncements={false}
									enableShare
									enableFeedback
								/>
							)}
						</>
					}
				/>
				<TabsPrimitive.List
					aria-label="Alerts sections"
					className="fs-ui tw:flex tw:gap-6 tw:overflow-x-auto tw:overflow-y-hidden tw:font-sans"
				>
					{tabs.map((tab) => (
						<TabsPrimitive.Trigger
							key={tab.value}
							value={tab.value}
							data-testid={`page-tab-${tab.value}`}
							className={TAB_TRIGGER_CLASS}
						>
							{tab.label}
							{tab.badge}
						</TabsPrimitive.Trigger>
					))}
				</TabsPrimitive.List>
			</div>
			<div className="tw:mx-auto tw:box-border tw:flex tw:w-full tw:max-w-[1600px] tw:flex-1 tw:flex-col tw:px-4 tw:pt-4 tw:pb-6 tw:md:px-6">
				{tabs.map((tab) => (
					<TabsPrimitive.Content
						key={tab.value}
						value={tab.value}
						className="tw:min-w-0 tw:outline-none tw:data-[state=active]:flex tw:data-[state=active]:flex-1 tw:data-[state=active]:flex-col"
					>
						{tab.content}
					</TabsPrimitive.Content>
				))}
			</div>
		</TabsPrimitive.Root>
	);
}

export default AlertsPageShell;
