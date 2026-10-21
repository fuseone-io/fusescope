import ROUTES from 'constants/routes';

import { filterRoutesForLicense } from '../licenseRoutes';
import { AppRoutes } from '../routes';

const route = (path: string): AppRoutes => ({
	path,
	exact: true,
	component: (): null => null,
	isPrivate: true,
	key: path as AppRoutes['key'],
});

const ROUTES_IN = [
	route(ROUTES.HOME),
	route(ROUTES.BILLING),
	route(ROUTES.INTEGRATIONS),
	route(ROUTES.INTEGRATIONS_DETAIL),
];

const paths = (routes: AppRoutes[]): string[] =>
	routes.map((r) => String(r.path));

describe('filterRoutesForLicense', () => {
	it.each([
		{
			build: 'community',
			license: { isCloudUser: false, isEnterpriseSelfHostedUser: false },
			isOnBasicPlan: true,
			expected: [ROUTES.HOME, ROUTES.INTEGRATIONS, ROUTES.INTEGRATIONS_DETAIL],
		},
		{
			build: 'cloud',
			license: { isCloudUser: true, isEnterpriseSelfHostedUser: false },
			isOnBasicPlan: false,
			expected: [
				ROUTES.HOME,
				ROUTES.BILLING,
				ROUTES.INTEGRATIONS,
				ROUTES.INTEGRATIONS_DETAIL,
			],
		},
		{
			build: 'cloud basic plan',
			license: { isCloudUser: true, isEnterpriseSelfHostedUser: false },
			isOnBasicPlan: true,
			expected: [ROUTES.HOME, ROUTES.INTEGRATIONS_DETAIL],
		},
		{
			build: 'enterprise basic plan',
			license: { isCloudUser: false, isEnterpriseSelfHostedUser: true },
			isOnBasicPlan: true,
			expected: [ROUTES.HOME, ROUTES.INTEGRATIONS_DETAIL],
		},
	])(
		'keeps the right routes for $build',
		({ license, isOnBasicPlan, expected }) => {
			expect(
				paths(filterRoutesForLicense(ROUTES_IN, { ...license, isOnBasicPlan })),
			).toStrictEqual(expected);
		},
	);
});
