import { useEffect } from 'react';
import ROUTES from 'constants/routes';
import { GlobalShortcuts } from 'constants/shortcuts/globalShortcuts';
import { useKeyboardHotkeys } from 'hooks/hotkeys/useKeyboardHotkeys';

import { SidebarNavigation } from './useSidebarNavigation';

const SHORTCUT_ROUTES: [string, string][] = [
	[GlobalShortcuts.NavigateToHome, ROUTES.HOME],
	[GlobalShortcuts.NavigateToServices, ROUTES.APPLICATION],
	[GlobalShortcuts.NavigateToTraces, ROUTES.TRACES_EXPLORER],
	[GlobalShortcuts.NavigateToLogs, ROUTES.LOGS],
	[GlobalShortcuts.NavigateToDashboards, ROUTES.ALL_DASHBOARD],
	[GlobalShortcuts.NavigateToMessagingQueues, ROUTES.MESSAGING_QUEUES_OVERVIEW],
	[GlobalShortcuts.NavigateToAlerts, ROUTES.LIST_ALL_ALERT],
	[GlobalShortcuts.NavigateToExceptions, ROUTES.ALL_ERROR],
	[GlobalShortcuts.NavigateToTracesFunnel, ROUTES.TRACES_FUNNELS],
	[GlobalShortcuts.NavigateToMetricsSummary, ROUTES.METRICS_EXPLORER],
	[GlobalShortcuts.NavigateToMetricsExplorer, ROUTES.METRICS_EXPLORER_EXPLORER],
	[GlobalShortcuts.NavigateToSettings, ROUTES.SETTINGS],
	[GlobalShortcuts.NavigateToSettingsIngestion, ROUTES.INGESTION_SETTINGS],
	[GlobalShortcuts.NavigateToSettingsBilling, ROUTES.BILLING],
	[GlobalShortcuts.NavigateToSettingsNotificationChannels, ROUTES.ALL_CHANNELS],
	[
		GlobalShortcuts.NavigateToSettingsServiceAccounts,
		ROUTES.SERVICE_ACCOUNTS_SETTINGS,
	],
	[GlobalShortcuts.NavigateToSettingsRoles, ROUTES.ROLES_SETTINGS],
	[GlobalShortcuts.NavigateToSettingsMembers, ROUTES.MEMBERS_SETTINGS],
	[GlobalShortcuts.NavigateToLogsPipelines, ROUTES.LOGS_PIPELINES],
];

/** The Shift+<key> page shortcuts listed under Settings → Keyboard Shortcuts. */
export function useNavigationShortcuts(
	navigate: SidebarNavigation['navigate'],
): void {
	const { registerShortcut, deregisterShortcut } = useKeyboardHotkeys();

	useEffect(() => {
		SHORTCUT_ROUTES.forEach(([shortcut, route]) =>
			registerShortcut(shortcut, () => navigate(route, null)),
		);
		return (): void => {
			SHORTCUT_ROUTES.forEach(([shortcut]) => deregisterShortcut(shortcut));
		};
	}, [deregisterShortcut, navigate, registerShortcut]);
}
