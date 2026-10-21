import ROUTES from 'constants/routes';

import { CrumbContext, CrumbRoute } from './types';

function param(name: string) {
	return ({ params }: CrumbContext): string => {
		const value = params[name] ?? '';
		try {
			return decodeURIComponent(value);
		} catch {
			return value;
		}
	};
}

/**
 * Pages below a sidebar item. Sidebar roots need no entry: their crumb is the
 * nav item's label. Static paths come before the dynamic ones they overlap.
 */
export const CRUMB_ROUTES: Record<string, CrumbRoute> = {
	[ROUTES.SERVICE_METRICS]: {
		parent: ROUTES.APPLICATION,
		label: param('servicename'),
		mono: true,
	},
	[ROUTES.SERVICE_TOP_LEVEL_OPERATIONS]: {
		parent: ROUTES.SERVICE_METRICS,
		label: 'Top level operations',
	},
	[ROUTES.TRACE_DETAIL]: {
		parent: ROUTES.TRACES_EXPLORER,
		label: param('id'),
		mono: true,
	},
	[ROUTES.TRACES_SAVE_VIEWS]: {
		parent: ROUTES.TRACES_EXPLORER,
		label: 'Saved views',
	},
	[ROUTES.TRACES_FUNNELS]: { parent: ROUTES.TRACES_EXPLORER, label: 'Funnels' },
	[ROUTES.TRACES_FUNNELS_DETAIL]: {
		parent: ROUTES.TRACES_FUNNELS,
		label: param('funnelId'),
		mono: true,
	},
	[ROUTES.LOGS_PIPELINES]: { parent: ROUTES.LOGS_EXPLORER, label: 'Pipelines' },
	[ROUTES.LOGS_SAVE_VIEWS]: {
		parent: ROUTES.LOGS_EXPLORER,
		label: 'Saved views',
	},
	[ROUTES.METRICS_EXPLORER_EXPLORER]: {
		parent: ROUTES.METRICS_EXPLORER,
		label: 'Explorer',
	},
	[ROUTES.METRICS_EXPLORER_VIEWS]: {
		parent: ROUTES.METRICS_EXPLORER,
		label: 'Views',
	},
	[ROUTES.METRICS_EXPLORER_VOLUME_CONTROL]: {
		parent: ROUTES.METRICS_EXPLORER,
		label: 'Volume control',
	},
	[ROUTES.DASHBOARD]: {
		parent: ROUTES.ALL_DASHBOARD,
		label: ({ dashboardName }): string => dashboardName || 'Dashboard',
	},
	[ROUTES.INFRASTRUCTURE_MONITORING_KUBERNETES]: {
		parent: ROUTES.INFRASTRUCTURE_MONITORING_HOSTS,
		label: 'Kubernetes',
	},
	[ROUTES.ALERTS_NEW]: { parent: ROUTES.LIST_ALL_ALERT, label: 'New alert' },
	[ROUTES.EDIT_ALERTS]: { parent: ROUTES.LIST_ALL_ALERT, label: 'Edit alert' },
	[ROUTES.ALERT_HISTORY]: { parent: ROUTES.LIST_ALL_ALERT, label: 'History' },
	[ROUTES.ALERT_OVERVIEW]: { parent: ROUTES.LIST_ALL_ALERT, label: 'Overview' },
	[ROUTES.CHANNELS_NEW]: {
		parent: ROUTES.LIST_ALL_ALERT,
		label: 'New channel',
	},
	[ROUTES.CHANNELS_EDIT]: {
		parent: ROUTES.LIST_ALL_ALERT,
		label: 'Edit channel',
	},
	[ROUTES.ERROR_DETAIL]: { parent: ROUTES.ALL_ERROR, label: 'Exception' },
	[ROUTES.MESSAGING_QUEUES_KAFKA]: {
		parent: ROUTES.MESSAGING_QUEUES_OVERVIEW,
		label: 'Kafka',
	},
	[ROUTES.MESSAGING_QUEUES_KAFKA_DETAIL]: {
		parent: ROUTES.MESSAGING_QUEUES_KAFKA,
		label: 'Detail',
	},
	[ROUTES.MESSAGING_QUEUES_CELERY_TASK]: {
		parent: ROUTES.MESSAGING_QUEUES_OVERVIEW,
		label: 'Celery',
	},
	[ROUTES.AI_OBSERVABILITY_EXPLORER]: {
		parent: ROUTES.AI_OBSERVABILITY_OVERVIEW,
		label: 'Explorer',
	},
	[ROUTES.AI_OBSERVABILITY_CONFIGURATION]: {
		parent: ROUTES.AI_OBSERVABILITY_OVERVIEW,
		label: 'Configuration',
	},
	[ROUTES.AI_OBSERVABILITY_ATTRIBUTE_MAPPING]: {
		parent: ROUTES.AI_OBSERVABILITY_OVERVIEW,
		label: 'Attribute mapping',
	},
	[ROUTES.API_MONITORING_DOMAIN]: {
		parent: ROUTES.API_MONITORING,
		label: param('domain'),
		mono: true,
	},
	[ROUTES.METER_EXPLORER]: { parent: ROUTES.METER, label: 'Explorer' },
	[ROUTES.METER_EXPLORER_VIEWS]: {
		parent: ROUTES.METER_EXPLORER,
		label: 'Views',
	},
	[ROUTES.INTEGRATIONS_DETAIL]: {
		parent: ROUTES.INTEGRATIONS,
		label: ({ integrationTitle }): string => integrationTitle || 'Integration',
	},
	[ROUTES.MY_SETTINGS]: { parent: ROUTES.SETTINGS, label: 'Account' },
	[ROUTES.ORG_SETTINGS]: { parent: ROUTES.SETTINGS, label: 'Single Sign-on' },
	[ROUTES.INGESTION_SETTINGS]: { parent: ROUTES.SETTINGS, label: 'Ingestion' },
	[ROUTES.BILLING]: { parent: ROUTES.SETTINGS, label: 'Billing' },
	[ROUTES.MEMBERS_SETTINGS]: { parent: ROUTES.SETTINGS, label: 'Members' },
	[ROUTES.SERVICE_ACCOUNTS_SETTINGS]: {
		parent: ROUTES.SETTINGS,
		label: 'Service Accounts',
	},
	[ROUTES.SHORTCUTS]: { parent: ROUTES.SETTINGS, label: 'Keyboard Shortcuts' },
	[ROUTES.MCP_SERVER]: { parent: ROUTES.SETTINGS, label: 'MCP Server' },
	[ROUTES.ROLES_SETTINGS]: { parent: ROUTES.SETTINGS, label: 'Roles' },
	[ROUTES.ROLE_CREATE]: { parent: ROUTES.ROLES_SETTINGS, label: 'New role' },
	[ROUTES.ROLE_DETAILS]: {
		parent: ROUTES.ROLES_SETTINGS,
		label: param('roleId'),
		mono: true,
	},
	[ROUTES.ROLE_EDIT]: { parent: ROUTES.ROLE_DETAILS, label: 'Edit' },
	[ROUTES.VERSION]: { label: 'Status' },
	[ROUTES.LIST_LICENSES]: { label: 'Licenses' },
	[ROUTES.SUPPORT]: { label: 'Support' },
	[ROUTES.USAGE_EXPLORER]: { label: 'Usage explorer' },
};

export const SEARCH_LABEL = 'Search pages and actions';
