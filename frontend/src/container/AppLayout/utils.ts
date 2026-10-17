import ROUTES from 'constants/routes';

const PARAM_SEGMENT = /:[^/]+/g;
const REGEX_SPECIALS = /[.+*?^$()[\]{}|\\]/g;

function templateToRegex(template: string): RegExp {
	const pattern = template
		.replace(REGEX_SPECIALS, '\\$&')
		.replace(PARAM_SEGMENT, '[^/]+');
	return new RegExp(`^${pattern}$`);
}

export function getRouteKey(pathname: string): string {
	const entries = Object.entries(ROUTES);

	const exact = entries.find(([, value]) => value === pathname);
	if (exact) {
		return exact[0];
	}

	// First template that matches wins, so declaration order in `ROUTES`
	// matters when templates can overlap. Today's set is unambiguous because
	// `[^/]+` is segment-bounded, but if you ever add a sibling like
	// `/services/list` next to `SERVICE_METRICS: '/services/:servicename'`,
	// list the more-specific (more-static-segments) entry first in `ROUTES`
	// — otherwise the param template will swallow the static path.
	const dynamic = entries.find(
		([, value]) => value.includes(':') && templateToRegex(value).test(pathname),
	);

	return dynamic?.[0] ?? 'DEFAULT';
}

/** Routes rendered without the sidebar and app header. */
export function isFullScreenRoute(pathname: string): boolean {
	return (
		pathname === ROUTES.ONBOARDING ||
		pathname === ROUTES.GET_STARTED_WITH_CLOUD ||
		pathname.startsWith('/public/dashboard/') ||
		getRouteKey(pathname) === 'DASHBOARD_PANEL_EDITOR'
	);
}
