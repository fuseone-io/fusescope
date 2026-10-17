import { generatePath, matchPath } from 'react-router-dom';
import {
	AI_ASSISTANT_NAV_ITEM,
	INTEGRATIONS_NAV_ITEM,
	NAV_GROUPS,
	SETTINGS_NAV_ITEM,
} from 'components/AppSidebar/constants';
import ROUTES from 'constants/routes';
import { getActiveMenuKeyFromPath } from 'container/SideNav/sideNav.utils';
import {
	routesToDisable,
	routesToSkip,
} from 'container/TopNav/DateTimeSelectionV2/constants';

import { CRUMB_ROUTES } from './constants';
import { Crumb, CrumbContext } from './types';

const NAV_LABELS = new Map(
	[
		...NAV_GROUPS.flatMap((group) => group.items),
		INTEGRATIONS_NAV_ITEM,
		AI_ASSISTANT_NAV_ITEM,
		SETTINGS_NAV_ITEM,
	].map((item) => [item.key, item.label]),
);

/** Pages that render their own time picker, or none. */
const ROUTES_WITHOUT_GLOBAL_PICKER = [
	ROUTES.SIGN_UP,
	ROUTES.ALERTS_NEW,
	ROUTES.AI_ASSISTANT,
	...routesToDisable,
	...routesToSkip,
];

function matchesExactly(pathname: string, path: string): boolean {
	return matchPath(pathname, { path, exact: true }) !== null;
}

export function isNavRoute(path: string): boolean {
	return NAV_LABELS.has(path);
}

export function showsGlobalTimePicker(pathname: string): boolean {
	return !ROUTES_WITHOUT_GLOBAL_PICKER.some((path) =>
		matchesExactly(pathname, path),
	);
}

/** The route template `pathname` matches in `CRUMB_ROUTES`, with its params. */
export function matchCrumbRoute(
	pathname: string,
): { path: string; params: CrumbContext['params'] } | null {
	for (const path of Object.keys(CRUMB_ROUTES)) {
		const match = matchPath<CrumbContext['params']>(pathname, {
			path,
			exact: true,
		});
		if (match) {
			return { path, params: match.params };
		}
	}
	return null;
}

function crumbFor(path: string, context: CrumbContext): Crumb | null {
	const route = CRUMB_ROUTES[path];
	const label = route
		? typeof route.label === 'function'
			? route.label(context)
			: route.label
		: NAV_LABELS.get(path);
	if (!label) {
		return null;
	}
	return {
		key: path,
		label,
		path: generatePath(path, context.params),
		mono: route?.mono ?? false,
	};
}

/** Breadcrumb for `pathname`, root first; the sidebar item's label otherwise. */
export function resolveCrumbs(
	pathname: string,
	dashboardName?: string,
): Crumb[] {
	const match = matchCrumbRoute(pathname);
	if (!match) {
		const fallback = crumbFor(getActiveMenuKeyFromPath(pathname), { params: {} });
		return fallback ? [fallback] : [];
	}

	const context: CrumbContext = { params: match.params, dashboardName };
	const crumbs: Crumb[] = [];
	let path: string | undefined = match.path;
	while (path) {
		const crumb = crumbFor(path, context);
		if (!crumb) {
			break;
		}
		crumbs.unshift(crumb);
		path = CRUMB_ROUTES[path]?.parent;
	}
	return crumbs;
}
