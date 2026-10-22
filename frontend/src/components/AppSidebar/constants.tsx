import Noz from 'components/Noz/Noz';
import { NOZ_TOOLTIP_TITLE } from 'components/Noz/Noz.constants';
import ROUTES from 'constants/routes';
import { AI_ASSISTANT_NAV_KEY } from 'container/SideNav/menuItems';
import {
	AppWindow,
	Bell,
	Binoculars,
	Boxes,
	Brain,
	Bug,
	ChartArea,
	ChartColumn,
	DraftingCompass,
	HardDrive,
	House,
	LayoutGrid,
	ListMinus,
	Route,
	ScrollText,
	Settings,
	Unplug,
} from 'lucide-react';

import { NavGroup, NavItem, NavVisibility } from './types';

/** Colours are `!important`: the app's global link styles are unlayered. */
export const NAV_BUTTON_CLASS =
	'tw:gap-2 tw:rounded-[6px] tw:px-2 tw:text-[13px] tw:font-medium tw:text-muted-foreground! tw:hover:bg-muted! tw:hover:text-foreground! tw:data-[active=true]:bg-primary-soft! tw:data-[active=true]:text-primary-ink! tw:data-[active=true]:hover:bg-primary-soft! tw:data-[active=true]:hover:text-primary-ink! tw:[&>svg]:stroke-[1.75]';

export const WORKSPACE_LOCKED_TOOLTIP =
	'Unavailable while the workspace is locked';

export const NAV_GROUPS: NavGroup[] = [
	{
		key: 'observe',
		label: 'Observe',
		items: [
			{ key: ROUTES.HOME, itemKey: 'home', label: 'Home', icon: <House /> },
			{
				key: ROUTES.APPLICATION,
				itemKey: 'services',
				label: 'Services',
				icon: <HardDrive />,
			},
			{
				key: ROUTES.RUM_APPLICATIONS,
				itemKey: 'frontend',
				label: 'Frontend',
				icon: <AppWindow />,
				badge: 'Beta',
			},
			{
				key: ROUTES.TRACES_EXPLORER,
				itemKey: 'traces',
				label: 'Traces',
				icon: <DraftingCompass />,
			},
			{ key: ROUTES.LOGS, itemKey: 'logs', label: 'Logs', icon: <ScrollText /> },
			{
				key: ROUTES.METRICS_EXPLORER,
				itemKey: 'metrics',
				label: 'Metrics',
				icon: <ChartColumn />,
			},
			{
				key: ROUTES.ALL_DASHBOARD,
				itemKey: 'dashboards',
				label: 'Dashboards',
				icon: <LayoutGrid />,
			},
			{
				key: ROUTES.INFRASTRUCTURE_MONITORING_HOSTS,
				itemKey: 'infrastructure',
				label: 'Infrastructure',
				icon: <Boxes />,
			},
			{
				key: ROUTES.SERVICE_MAP,
				itemKey: 'service-map',
				label: 'Service Map',
				icon: <Route />,
			},
		],
	},
	{
		key: 'respond',
		label: 'Respond',
		items: [
			{
				key: ROUTES.LIST_ALL_ALERT,
				itemKey: 'alerts',
				label: 'Alerts',
				icon: <Bell />,
			},
			{
				key: ROUTES.ALL_ERROR,
				itemKey: 'exceptions',
				label: 'Exceptions',
				icon: <Bug />,
			},
		],
	},
	{
		key: 'analyze',
		label: 'Analyze',
		items: [
			{
				key: ROUTES.API_MONITORING,
				itemKey: 'external-apis',
				label: 'External APIs',
				icon: <Binoculars />,
			},
			{
				key: ROUTES.MESSAGING_QUEUES_OVERVIEW,
				itemKey: 'messaging-queues',
				label: 'Messaging Queues',
				icon: <ListMinus />,
			},
			{
				key: ROUTES.AI_OBSERVABILITY_OVERVIEW,
				itemKey: 'ai-observability',
				label: 'AI Observability',
				icon: <Brain />,
				badge: 'Beta',
			},
			{
				key: ROUTES.METER,
				itemKey: 'meter-explorer',
				label: 'Cost Meter',
				icon: <ChartArea />,
			},
		],
	},
];

export const INTEGRATIONS_NAV_ITEM: NavItem = {
	key: ROUTES.INTEGRATIONS,
	itemKey: 'integrations',
	label: 'Integrations',
	icon: <Unplug />,
	isVisible: ({ isAdmin, isEditor }: NavVisibility): boolean =>
		isAdmin || isEditor,
};

export const AI_ASSISTANT_NAV_ITEM: NavItem = {
	key: AI_ASSISTANT_NAV_KEY,
	itemKey: 'ai-assistant',
	label: 'Noz',
	icon: <Noz size={16} />,
	badge: 'Early Access',
	tooltip: NOZ_TOOLTIP_TITLE,
};

export const SETTINGS_NAV_ITEM: NavItem = {
	key: ROUTES.SETTINGS,
	itemKey: 'settings',
	label: 'Settings',
	icon: <Settings />,
};

export const FUSESCOPE_REPO_URL = 'https://github.com/fuseone-io/fusescope';
export const FUSESCOPE_RELEASES_URL = `${FUSESCOPE_REPO_URL}/releases`;
export const FUSESCOPE_NEW_ISSUE_URL = `${FUSESCOPE_REPO_URL}/issues/new/choose`;
