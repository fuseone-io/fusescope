import { Route, Switch } from 'react-router-dom';
import ROUTES from 'constants/routes';
import { useGetTenantLicense } from 'hooks/useGetTenantLicense';
import { rest, server } from 'mocks-server/server';
import { render, screen } from 'tests/test-utils';

import IntegrationDetailPage from '../IntegrationDetailPage/IntegrationDetailPage';
import Integrations from '../Integrations';

jest.mock('hooks/useGetTenantLicense', () => ({
	useGetTenantLicense: jest.fn(),
}));

const mockLicense = jest.mocked(useGetTenantLicense);

const COMMUNITY = {
	isCloudUser: false,
	isEnterpriseSelfHostedUser: false,
	isCommunityUser: true,
	isCommunityEnterpriseUser: false,
};
const CLOUD = { ...COMMUNITY, isCommunityUser: false, isCloudUser: true };
const ENTERPRISE = {
	...COMMUNITY,
	isCommunityUser: false,
	isEnterpriseSelfHostedUser: true,
};

const REDIS = {
	id: 'redis',
	title: 'Redis',
	description: 'Monitor Redis with metrics and logs',
	author: { name: 'FuseScope', email: '', homepage: '' },
	icon: '',
	is_installed: false,
};

beforeEach(() => {
	server.use(
		rest.get('*/api/v1/integrations', (_req, res, ctx) =>
			res(ctx.json({ status: 'success', data: { integrations: [REDIS] } })),
		),
	);
});

describe('Integrations list', () => {
	it.each([
		['community', false, COMMUNITY],
		['cloud', true, CLOUD],
		['enterprise', true, ENTERPRISE],
	])(
		'%s build shows one click integrations: %s',
		async (_build, shown, license) => {
			mockLicense.mockReturnValue(license);
			render(<Integrations />);

			await expect(screen.findByText('Redis')).resolves.toBeInTheDocument();
			expect(screen.queryByText('One click integrations') !== null).toBe(shown);
			expect(screen.queryByText('Amazon Web Services') !== null).toBe(shown);
		},
	);
});

describe('Integration detail', () => {
	it.each(['aws', 'azure', 'gcp'])(
		'redirects a community user from /integrations/%s to the list',
		async (id) => {
			mockLicense.mockReturnValue(COMMUNITY);
			render(
				<Switch>
					<Route exact path={ROUTES.INTEGRATIONS}>
						<div data-testid="integrations-list-route" />
					</Route>
					<Route exact path={ROUTES.INTEGRATIONS_DETAIL}>
						<IntegrationDetailPage />
					</Route>
				</Switch>,
				undefined,
				{ initialRoute: `/integrations/${id}` },
			);

			await expect(
				screen.findByTestId('integrations-list-route'),
			).resolves.toBeInTheDocument();
		},
	);
});
