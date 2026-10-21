import { useMemo, useState } from 'react';
import type { DashboardtypesGettableDashboardV2DTO } from 'api/generated/services/fuseScope.schemas';
import PageTabs from 'components/PageTemplate/components/PageTabs';
import TabCountBadge from 'components/PageTemplate/components/TabCountBadge';
import type { PageTab } from 'components/PageTemplate/types';
import { Braces, Globe, Table2 } from 'lucide-react';

import Overview from './Overview';
import PublicDashboardSettings from './PublicDashboard';
import VariablesSettings from './Variables';
import { useGetTenantLicense } from 'hooks/useGetTenantLicense';

import { useDashboardStore } from '../store/useDashboardStore';

interface DashboardSettingsProps {
	dashboard: DashboardtypesGettableDashboardV2DTO;
}

enum TabKeys {
	OVERVIEW = 'Overview',
	VARIABLES = 'Variables',
	PUBLISH = 'Publish',
}

const ICON_CLASS = 'tw:size-4';

// Tabs sit flush under the sheet title; each panel fills the rest and owns its
// scroll and footer.
const TABS_LAYOUT =
	'tw:min-h-0 tw:flex-1 tw:gap-0 tw:[&>[role=tablist]]:flex-none tw:[&>[role=tablist]]:px-6 tw:[&>[role=tabpanel]:not([hidden])]:flex tw:[&>[role=tabpanel]]:min-h-0 tw:[&>[role=tabpanel]]:flex-1 tw:[&>[role=tabpanel]]:flex-col';

function DashboardSettings({ dashboard }: DashboardSettingsProps): JSX.Element {
	const { isCloudUser, isEnterpriseSelfHostedUser } = useGetTenantLicense();
	// Opened once per drawer mount (the drawer destroys on close); a deep-link
	// request lands us on the right tab.
	const settingsRequest = useDashboardStore((s) => s.settingsRequest);
	const [tab, setTab] = useState<string>(
		settingsRequest?.tab ?? TabKeys.OVERVIEW,
	);

	const enablePublicDashboard = isCloudUser || isEnterpriseSelfHostedUser;
	const variableCount = dashboard.spec.variables?.length ?? 0;

	const tabs: PageTab[] = useMemo(() => {
		const next: PageTab[] = [
			{
				value: TabKeys.OVERVIEW,
				label: (
					<>
						<Table2 className={ICON_CLASS} aria-hidden="true" />
						{TabKeys.OVERVIEW}
					</>
				),
				content: <Overview dashboard={dashboard} />,
			},
			{
				value: TabKeys.VARIABLES,
				label: (
					<>
						<Braces className={ICON_CLASS} aria-hidden="true" />
						{TabKeys.VARIABLES}
					</>
				),
				badge:
					variableCount > 0 ? (
						<span aria-hidden="true">
							<TabCountBadge count={variableCount} />
						</span>
					) : undefined,
				content: <VariablesSettings dashboard={dashboard} />,
			},
		];

		// Readable by anyone who can open the dashboard; the controls inside
		// gate on update.
		if (enablePublicDashboard) {
			next.push({
				value: TabKeys.PUBLISH,
				label: (
					<>
						<Globe className={ICON_CLASS} aria-hidden="true" />
						{TabKeys.PUBLISH}
					</>
				),
				content: <PublicDashboardSettings dashboard={dashboard} />,
			});
		}

		return next;
	}, [enablePublicDashboard, dashboard, variableCount]);

	return (
		<PageTabs
			label="Dashboard settings"
			tabs={tabs}
			value={tab}
			onValueChange={setTab}
			className={TABS_LAYOUT}
		/>
	);
}

export default DashboardSettings;
