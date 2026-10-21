import ROUTES from 'constants/routes';

import { AppRoutes } from './routes';

interface LicenseFlags {
	isCloudUser: boolean;
	isEnterpriseSelfHostedUser: boolean;
	isOnBasicPlan: boolean;
}

export function filterRoutesForLicense(
	routes: AppRoutes[],
	{ isCloudUser, isEnterpriseSelfHostedUser, isOnBasicPlan }: LicenseFlags,
): AppRoutes[] {
	// if not a cloud user then remove billing
	if (!isCloudUser && !isEnterpriseSelfHostedUser) {
		return routes.filter((route) => route.path !== ROUTES.BILLING);
	}
	// if the user is on basic plan then remove billing
	if (isOnBasicPlan) {
		return routes.filter(
			(route) =>
				route.path !== ROUTES.BILLING && route.path !== ROUTES.INTEGRATIONS,
		);
	}
	return routes;
}
