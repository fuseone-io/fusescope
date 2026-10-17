import ROUTES from 'constants/routes';
import {
	Bot,
	FileKey2,
	Keyboard,
	Receipt,
	Rocket,
	Settings,
	Shield,
	Sparkles,
	Unplug,
	User,
	Users,
} from '@signozhq/icons';

import { SettingsNavSection } from './sideNav.types';

// The AI Assistant route is parameterized as `/ai-assistant/:conversationId`.
// Sending the user to `/ai-assistant/new` triggers the page's fallback that
// spawns a fresh conversation and replaces the URL with the real id, so
// every sidenav click starts a new chat (the in-page history sidebar lets
// the user resume earlier ones). Using a stable concrete path also lets
// the active-highlight map below resolve `/ai-assistant/<any id>` back to
// this menu key.
export const AI_ASSISTANT_NAV_KEY = '/ai-assistant/new';

export const settingsNavSections: SettingsNavSection[] = [
	{
		key: 'general',
		items: [
			{
				key: ROUTES.SETTINGS,
				label: 'Workspace',
				icon: <Settings size={16} />,
				isEnabled: true,
				itemKey: 'workspace',
			},
			{
				key: ROUTES.MY_SETTINGS,
				label: 'Account',
				icon: <User size={16} />,
				isEnabled: true,
				itemKey: 'account',
			},
			// TODO(@SigNoz/pulse-frontend): https://github.com/SigNoz/engineering-pod/issues/5323
			{
				key: ROUTES.ALL_CHANNELS,
				label: 'Notification Channels',
				icon: <FileKey2 size={16} />,
				isEnabled: true,
				itemKey: 'notification-channels',
			},
			{
				key: ROUTES.BILLING,
				label: 'Billing',
				icon: <Receipt size={16} />,
				isEnabled: false,
				itemKey: 'billing',
			},
			{
				key: ROUTES.INTEGRATIONS,
				label: 'Integrations',
				icon: <Unplug size={16} />,
				isEnabled: false,
				itemKey: 'integrations',
			},
			{
				key: ROUTES.MCP_SERVER,
				label: 'MCP Server',
				icon: <Sparkles size={16} />,
				isEnabled: false,
				itemKey: 'mcp-server',
			},
		],
	},

	{
		key: 'identity-access',
		title: 'Identity & Access',
		items: [
			{
				key: ROUTES.ROLES_SETTINGS,
				label: 'Roles',
				icon: <Shield size={16} />,
				isEnabled: false,
				itemKey: 'roles',
				isBeta: true,
			},
			{
				key: ROUTES.MEMBERS_SETTINGS,
				label: 'Members',
				icon: <Users size={16} />,
				isEnabled: false,
				itemKey: 'members',
			},
			{
				key: ROUTES.SERVICE_ACCOUNTS_SETTINGS,
				label: 'Service Accounts',
				icon: <Bot size={16} />,
				isEnabled: false,
				itemKey: 'service-accounts',
			},
			{
				key: ROUTES.INGESTION_SETTINGS,
				label: 'Ingestion',
				icon: <Rocket size={16} style={{ transform: 'rotate(45deg)' }} />,
				isEnabled: false,
				itemKey: 'ingestion',
			},
		],
	},
	{
		key: 'authentication',
		title: 'Authentication',
		items: [
			{
				key: ROUTES.ORG_SETTINGS,
				label: 'Single Sign-on',
				icon: <User size={16} />,
				isEnabled: false,
				itemKey: 'sso',
			},
		],
	},
	{
		key: 'shortcuts',
		hasDivider: true,
		items: [
			{
				key: ROUTES.SHORTCUTS,
				label: 'Keyboard Shortcuts',
				icon: <Keyboard size={16} />,
				isEnabled: true,
				itemKey: 'keyboard-shortcuts',
			},
		],
	},
];

/** Mapping of some newly added routes and their corresponding active sidebar menu key
    This is used to highlight the correct menu item when the user navigates to a new route
**/
export const NEW_ROUTES_MENU_ITEM_KEY_MAP: Record<string, string> = {
	[ROUTES.TRACE_BASE]: ROUTES.TRACES_EXPLORER,
	[ROUTES.TRACE_EXPLORER]: ROUTES.TRACES_EXPLORER,
	[ROUTES.LOGS_BASE]: ROUTES.LOGS_EXPLORER,
	[ROUTES.METRICS_EXPLORER_BASE]: ROUTES.METRICS_EXPLORER,
	[ROUTES.INFRASTRUCTURE_MONITORING_BASE]:
		ROUTES.INFRASTRUCTURE_MONITORING_HOSTS,
	[ROUTES.API_MONITORING_BASE]: ROUTES.API_MONITORING,
	[ROUTES.MESSAGING_QUEUES_BASE]: ROUTES.MESSAGING_QUEUES_OVERVIEW,
	[ROUTES.AI_OBSERVABILITY_BASE]: ROUTES.AI_OBSERVABILITY_OVERVIEW,
	// `getActiveMenuKeyFromPath` strips the URL down to its first segment;
	// `/ai-assistant/<id>` reduces to `/ai-assistant`, which we point back
	// to the AI Assistant menu item's concrete key.
	[ROUTES.AI_ASSISTANT_BASE]: AI_ASSISTANT_NAV_KEY,
};
