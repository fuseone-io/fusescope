import { ReactNode } from 'react';
import PageHeader from 'components/PageTemplate/components/PageHeader';
import PageTabs from 'components/PageTemplate/components/PageTabs';
import { PageTab } from 'components/PageTemplate/types';
import HeaderRightSection from 'components/HeaderRightSection/HeaderRightSection';
import { Bell } from 'lucide-react';

/** Stretches the active panel so tables below can size their pages to it. */
export const FILL_TAB_PANEL =
	'tw:flex-1 tw:[&>[role=tabpanel][data-state=active]]:flex tw:[&>[role=tabpanel][data-state=active]]:flex-1 tw:[&>[role=tabpanel][data-state=active]]:flex-col';

interface AlertsPageShellProps {
	tabs: PageTab[];
	activeTab: string;
	onTabChange: (tab: string) => void;
	actions?: ReactNode;
	/** Off where the app header already shows share and feedback. */
	showHeaderRightSection?: boolean;
	testId?: string;
}

/**
 * The alerts page column: header and the top-level tabs. Unlike
 * `PageTemplate` it stretches to the viewport, because the rule and alert
 * tables compute their page size from the height left to them.
 */
function AlertsPageShell({
	tabs,
	activeTab,
	onTabChange,
	actions,
	showHeaderRightSection = true,
	testId = 'alerts-page',
}: AlertsPageShellProps): JSX.Element {
	return (
		<div
			data-testid={testId}
			className="tw:flex tw:w-full tw:flex-1 tw:flex-col tw:bg-background tw:text-foreground"
		>
			<div className="tw:mx-auto tw:box-border tw:flex tw:w-full tw:max-w-[1600px] tw:flex-1 tw:flex-col tw:gap-6 tw:p-4 tw:md:p-6">
				<PageHeader
					icon={<Bell />}
					title="Alerts"
					actions={
						<>
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
				<PageTabs
					label="Alerts sections"
					tabs={tabs}
					value={activeTab}
					onValueChange={onTabChange}
					className={FILL_TAB_PANEL}
				/>
			</div>
		</div>
	);
}

export default AlertsPageShell;
