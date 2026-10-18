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

import AlertsPageShell, { FILL_TAB_PANEL } from './components/AlertsPageShell';
import { AlertListSubTabs, AlertListTabs } from './types';

const TAB_PANE_CLASS = 'tw:flex tw:flex-1 tw:flex-col';

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
	const isChannelDetails = isChannelsNew || isChannelsEdit;

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
			label: 'Planned Downtime',
			content: <PlannedDowntime />,
		},
		{
			value: AlertListSubTabs.ROUTING_POLICIES,
			label: 'Routing Policies',
			content: <RoutingPolicies />,
		},
	];

	const tabs: PageTab[] = [
		{
			value: AlertListTabs.TRIGGERED_ALERTS,
			label: 'Triggered Alerts',
			content: <TriggeredAlerts />,
		},
		{
			value: AlertListTabs.ALERT_RULES,
			label: 'Alert Rules',
			content: (
				<div className={TAB_PANE_CLASS}>
					{isAlertHistory || isAlertOverview ? <AlertDetails /> : <AllAlertRules />}
				</div>
			),
		},
		{
			value: AlertListTabs.CHANNELS,
			label: 'Notification Channels',
			content: (
				<div className={TAB_PANE_CLASS}>
					{isChannelsNew && <ChannelsNew />}
					{isChannelsEdit && <ChannelsEdit />}
					{!isChannelDetails && <AllAlertChannels />}
				</div>
			),
		},
		{
			value: AlertListTabs.CONFIGURATION,
			label: 'Configuration',
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

	const getActiveKey = (): string => {
		if (isAlertHistory || isAlertOverview) {
			return AlertListTabs.ALERT_RULES;
		}
		if (isChannelDetails) {
			return AlertListTabs.CHANNELS;
		}
		return tab || AlertListTabs.ALERT_RULES;
	};

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
			activeTab={getActiveKey()}
			onTabChange={handleTabChange}
		/>
	);
}

export default AllAlertList;
