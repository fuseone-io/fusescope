import { useMemo } from 'react';
import { useQuery } from 'react-query';
import { useLocation } from 'react-router-dom';
import { useGetDashboardV2 } from 'api/generated/services/dashboard';
import { AxiosResponse } from 'axios';
import ROUTES from 'constants/routes';
import { ONE_CLICK_INTEGRATIONS } from 'container/Integrations/constants';
import { getIntegrationQueryKey } from 'hooks/Integrations/useGetIntegration';
import { GetIntegrationProps } from 'types/api/integrations/types';

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

/** Reads the integration the page already loaded; never fetches. */
function useCachedIntegrationTitle(integrationId: string | undefined): string {
	const { data } = useQuery<AxiosResponse<GetIntegrationProps>>(
		getIntegrationQueryKey(integrationId ?? ''),
		{ enabled: false, staleTime: Infinity },
	);
	if (!integrationId) {
		return '';
	}
	const cloud = ONE_CLICK_INTEGRATIONS.find(({ id }) => id === integrationId);
	return cloud?.title ?? data?.data?.data?.title ?? '';
}

export function useBreadcrumbs(): Crumb[] {
	const { pathname } = useLocation();

	const match = useMemo(() => matchCrumbRoute(pathname), [pathname]);
	const dashboardId =
		match?.path === ROUTES.DASHBOARD ? match.params.dashboardId : undefined;
	const integrationId =
		match?.path === ROUTES.INTEGRATIONS_DETAIL
			? match.params.integrationId
			: undefined;
	const dashboardName = useCachedDashboardName(dashboardId);
	const integrationTitle = useCachedIntegrationTitle(integrationId);

	return useMemo(
		() => resolveCrumbs(pathname, { dashboardName, integrationTitle }),
		[pathname, dashboardName, integrationTitle],
	);
}
