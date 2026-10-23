import { Route, Switch } from 'react-router-dom';
import ROUTES from 'constants/routes';
import { useGetTenantLicense } from 'hooks/useGetTenantLicense';
import { rest, server } from 'mocks-server/server';
import logEvent from 'api/common/logEvent';
import { render, screen, userEvent } from 'tests/test-utils';

import IntegrationDetailPage from '../IntegrationDetailPage/IntegrationDetailPage';
import Integrations from '../Integrations';

jest.mock('api/common/logEvent', () => ({
	__esModule: true,
	default: jest.fn(() => Promise.resolve({ statusCode: 200 })),
}));

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
			expect(screen.queryByText('One-click integrations') !== null).toBe(shown);
			expect(screen.queryByText('Amazon Web Services') !== null).toBe(shown);
		},
	);
});

describe('Integrations header', () => {
	it.each([
		['self-hosted', COMMUNITY],
		['cloud', CLOUD],
	])('opens the Get started catalog in a %s workspace', async (_, license) => {
		mockLicense.mockReturnValue(license);
		render(
			<Switch>
				<Route exact path={ROUTES.INTEGRATIONS}>
					<Integrations />
				</Route>
				<Route path={ROUTES.GET_STARTED}>
					<div data-testid="onboarding-route" />
				</Route>
			</Switch>,
			undefined,
			{ initialRoute: ROUTES.INTEGRATIONS },
		);

		await userEvent.click(await screen.findByTestId('integrations-data-sources'));

		await expect(
			screen.findByTestId('onboarding-route'),
		).resolves.toBeInTheDocument();
	});

	it('requests an integration as a prefilled GitHub issue', async () => {
		mockLicense.mockReturnValue(COMMUNITY);
		const open = jest.spyOn(window, 'open').mockReturnValue(null);
		const user = userEvent.setup({ pointerEventsCheck: 0 });
		render(<Integrations />);

		await user.click(await screen.findByTestId('integrations-request-button'));
		await user.type(
			await screen.findByTestId('integrations-request-name'),
			'Kafka & ZooKeeper',
		);
		await user.click(screen.getByTestId('integrations-request-submit'));

		expect(open).toHaveBeenCalledWith(
			'https://github.com/fuseone-io/fusescope/issues/new?template=request_integration.md&title=%5BIntegration%20Request%5D%20Kafka%20%26%20ZooKeeper',
			'_blank',
		);
		expect(logEvent).toHaveBeenCalledWith('Integration requested', {
			screen: 'Integration list page',
			integration: 'Kafka & ZooKeeper',
		});
		open.mockRestore();
	});
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
