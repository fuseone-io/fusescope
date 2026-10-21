import { useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import PageTabs from 'components/PageTemplate/components/PageTabs';
import { PageTab } from 'components/PageTemplate/types';
import ROUTES from 'constants/routes';
import AllAlertChannels from 'container/AllAlertChannels';
import AllAlertRules from 'container/ListAlertRules';
import { PlannedDowntime } from 'container/PlannedDowntime/PlannedDowntime';
import RoutingPolicies from 'container/RoutingPolicies';
import TriggeredAlerts from 'container/TriggeredAlerts';
import { useSafeNavigate } from 'hooks/useSafeNavigate';
import useUrlQuery from 'hooks/useUrlQuery';
import AlertDetails from 'pages/AlertDetails';
import ChannelsEdit from 'pages/ChannelsEdit';
import ChannelsNew from 'pages/ChannelsNew';
import {
	Bell,
	BellRing,
	CalendarClock,
	ListChecks,
	Route,
	Send,
	Settings2,
} from 'lucide-react';

import AlertsPageShell, { FILL_TAB_PANEL } from './components/AlertsPageShell';
import { AlertListSubTabs, AlertListTabs } from './types';

function tabLabel(Icon: typeof Bell, label: string): JSX.Element {
	return (
		<>
			<Icon aria-hidden="true" className="tw:size-4" />
			{label}
		</>
	);
}

function AllAlertList(): JSX.Element {
	const urlQuery = useUrlQuery();
	const location = useLocation();
	const { safeNavigate } = useSafeNavigate();

	const tab = urlQuery.get('tab');
	const subTab = urlQuery.get('subTab');
	const isAlertHistory = location.pathname === ROUTES.ALERT_HISTORY;
	const isAlertOverview = location.pathname === ROUTES.ALERT_OVERVIEW;
	const isChannelsNew = location.pathname === ROUTES.CHANNELS_NEW;
	const isChannelsEdit = location.pathname.startsWith('/alerts/channels/edit/');

	const handleConfigurationTabChange = useCallback(
		(subTab: string): void => {
			const queryParams = new URLSearchParams();

			queryParams.set('tab', AlertListTabs.CONFIGURATION);
			queryParams.set('subTab', subTab);
			safeNavigate(`/alerts?${queryParams.toString()}`);
		},
		[safeNavigate],
	);

	const configurationTabs: PageTab[] = [
		{
			value: AlertListSubTabs.PLANNED_DOWNTIME,
			label: tabLabel(CalendarClock, 'Planned Downtime'),
			content: <PlannedDowntime />,
		},
		{
			value: AlertListSubTabs.ROUTING_POLICIES,
			label: tabLabel(Route, 'Routing Policies'),
			content: <RoutingPolicies />,
		},
	];

	const tabs: PageTab[] = [
		{
			value: AlertListTabs.TRIGGERED_ALERTS,
			label: tabLabel(BellRing, 'Triggered Alerts'),
			content: <TriggeredAlerts />,
		},
		{
			value: AlertListTabs.ALERT_RULES,
			label: tabLabel(ListChecks, 'Alert Rules'),
			content: <AllAlertRules />,
		},
		{
			value: AlertListTabs.CHANNELS,
			label: tabLabel(Send, 'Notification Channels'),
			content: <AllAlertChannels />,
		},
		{
			value: AlertListTabs.CONFIGURATION,
			label: tabLabel(Settings2, 'Configuration'),
			content: (
				<PageTabs
					label="Configuration sections"
					tabs={configurationTabs}
					value={subTab || AlertListSubTabs.PLANNED_DOWNTIME}
					onValueChange={handleConfigurationTabChange}
					className={FILL_TAB_PANEL}
				/>
			),
		},
	];

	if (isAlertHistory || isAlertOverview) {
		return <AlertDetails />;
	}
	if (isChannelsNew) {
		return <ChannelsNew />;
	}
	if (isChannelsEdit) {
		return <ChannelsEdit />;
	}

	const handleTabChange = (tab: string): void => {
		const queryParams = new URLSearchParams();

		queryParams.set('tab', tab);

		// If navigating to Configuration tab, set default subTab
		if (tab === AlertListTabs.CONFIGURATION) {
			const currentSubTab = subTab || AlertListSubTabs.PLANNED_DOWNTIME;
			queryParams.set('subTab', currentSubTab);
		} else {
			// Clear subTab when navigating out of Configuration tab
			queryParams.delete('subTab');
		}

		safeNavigate(`/alerts?${queryParams.toString()}`);
	};

	return (
		<AlertsPageShell
			tabs={tabs}
			activeTab={tab || AlertListTabs.ALERT_RULES}
			onTabChange={handleTabChange}
		/>
	);
}

export default AllAlertList;
