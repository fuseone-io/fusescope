import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useGetDashboardV2 } from 'api/generated/services/dashboard';
import ROUTES from 'constants/routes';

import { Crumb } from '../types';
import { matchCrumbRoute, resolveCrumbs } from '../utils';

/** Reads the dashboard the page already loaded; never fetches. */
function useCachedDashboardName(dashboardId: string | undefined): string {
	const { data } = useGetDashboardV2(
		{ id: dashboardId ?? '' },
		{ query: { enabled: false, staleTime: Infinity } },
	);
	return dashboardId ? (data?.data?.spec?.display?.name ?? '') : '';
}

export function useBreadcrumbs(): Crumb[] {
	const { pathname } = useLocation();

	const match = useMemo(() => matchCrumbRoute(pathname), [pathname]);
	const dashboardId =
		match?.path === ROUTES.DASHBOARD ? match.params.dashboardId : undefined;
	const dashboardName = useCachedDashboardName(dashboardId);

	return useMemo(
		() => resolveCrumbs(pathname, dashboardName),
		[pathname, dashboardName],
	);
}
