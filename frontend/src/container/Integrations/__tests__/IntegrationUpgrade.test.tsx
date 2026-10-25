import { Route } from 'react-router-dom';
import ROUTES from 'constants/routes';
import { useGetTenantLicense } from 'hooks/useGetTenantLicense';
import { rest, server } from 'mocks-server/server';
import { render, screen, userEvent, waitFor } from 'tests/test-utils';
import { USER_ROLES } from 'types/roles';

import IntegrationDetailPage from '../IntegrationDetailPage/IntegrationDetailPage';
import Integrations from '../Integrations';

jest.mock('api/common/logEvent', () => ({
	__esModule: true,
	default: jest.fn(() => Promise.resolve({ statusCode: 200 })),
}));

jest.mock('hooks/useGetTenantLicense', () => ({
	useGetTenantLicense: jest.fn(),
}));

const AUTHOR = { name: 'FuseScope', email: '', homepage: '' };

const SUMMARY = {
	author: AUTHOR,
	description: 'Monitor it with metrics and logs',
	icon: '',
};

const detail = (
	version: string,
	latestVersion: string,
): Record<string, unknown> => ({
	...SUMMARY,
	id: 'builtin-redis',
	title: 'Redis',
	version,
	latest_version: latestVersion,
	installation: { installed_at: new Date().toISOString(), version },
	connection_status: { logs: null, metrics: null },
	categories: [],
	assets: { logs: { pipelines: [] }, dashboards: [], alerts: [] },
	overview: 'Redis overview',
	configuration: [{ title: 'Configure', instructions: 'Steps' }],
	data_collected: { logs: [], metrics: [] },
	connection_tests: null,
});

beforeEach(() => {
	jest.mocked(useGetTenantLicense).mockReturnValue({
		isCloudUser: false,
		isEnterpriseSelfHostedUser: false,
		isCommunityUser: true,
		isCommunityEnterpriseUser: false,
	});
});

describe('Integrations list', () => {
	it('flags installed integrations behind the catalog', async () => {
		server.use(
			rest.get('*/api/v1/integrations', (_req, res, ctx) =>
				res(
					ctx.json({
						status: 'success',
						data: {
							integrations: [
								{
									...SUMMARY,
									id: 'builtin-redis',
									title: 'Redis',
									is_installed: true,
									version: '1.0.0',
									latest_version: '1.1.0',
								},
								{
									...SUMMARY,
									id: 'builtin-mysql',
									title: 'MySQL',
									is_installed: true,
									version: '1.0.1',
									latest_version: '1.0.1',
								},
								{
									...SUMMARY,
									id: 'builtin-nginx',
									title: 'Nginx',
									is_installed: false,
									version: '1.2.0',
									latest_version: '1.2.0',
								},
							],
						},
					}),
				),
			),
		);

		render(<Integrations />);

		const badges = await screen.findAllByTestId('integration-update-available');
		expect(badges).toHaveLength(1);
		expect(badges[0]).toHaveTextContent('Update available · v1.0.0 → v1.1.0');
	});
});

describe('Integration detail', () => {
	const renderDetail = (role?: string): void => {
		render(
			<Route exact path={ROUTES.INTEGRATIONS_DETAIL}>
				<IntegrationDetailPage />
			</Route>,
			undefined,
			{ initialRoute: '/integrations/builtin-redis', role },
		);
	};

	const serveDetail = (current: () => Record<string, unknown>): void => {
		server.use(
			rest.get('*/api/v1/integrations/builtin-redis', (_req, res, ctx) =>
				res(ctx.json({ status: 'success', data: current() })),
			),
			rest.get(
				'*/api/v1/integrations/builtin-redis/connection_status',
				(_req, res, ctx) =>
					res(ctx.json({ status: 'success', data: { logs: null, metrics: null } })),
			),
		);
	};

	it('shows the installed version without an update when on the latest', async () => {
		serveDetail(() => detail('1.1.0', '1.1.0'));
		renderDetail();

		await expect(
			screen.findByTestId('integration-installed-version'),
		).resolves.toHaveTextContent('v1.1.0');
		expect(screen.queryByTestId('integration-update-available')).toBeNull();
		expect(screen.queryByTestId('integration-update-button')).toBeNull();
	});

	it('updates to the latest version after confirmation', async () => {
		let current = detail('1.0.0', '1.1.0');
		const upgradeBodies: unknown[] = [];
		serveDetail(() => current);
		server.use(
			rest.post('*/api/v1/integrations/upgrade', async (req, res, ctx) => {
				upgradeBodies.push(await req.json());
				current = detail('1.1.0', '1.1.0');
				return res(
					ctx.json({
						status: 'success',
						data: { id: 'builtin-redis', version: '1.1.0' },
					}),
				);
			}),
		);
		const user = userEvent.setup({ pointerEventsCheck: 0 });
		renderDetail();

		await expect(
			screen.findByTestId('integration-update-available'),
		).resolves.toHaveTextContent('Update available · v1.0.0 → v1.1.0');
		expect(screen.getByTestId('integration-installed-version')).toHaveTextContent(
			'v1.0.0',
		);

		await user.click(screen.getByTestId('integration-update-button'));
		await expect(
			screen.findByTestId('integration-update-dialog'),
		).resolves.toHaveTextContent(/dashboards are replaced/i);
		expect(upgradeBodies).toHaveLength(0);

		await user.click(screen.getByTestId('integration-update-confirm'));

		await waitFor(() =>
			expect(
				screen.getByTestId('integration-installed-version'),
			).toHaveTextContent('v1.1.0'),
		);
		expect(upgradeBodies).toStrictEqual([{ integration_id: 'builtin-redis' }]);
		expect(screen.queryByTestId('integration-update-available')).toBeNull();
		expect(screen.queryByTestId('integration-update-dialog')).toBeNull();
	});

	it('does not offer the update to viewers', async () => {
		serveDetail(() => detail('1.0.0', '1.1.0'));
		renderDetail(USER_ROLES.VIEWER);

		await expect(
			screen.findByTestId('integration-update-available'),
		).resolves.toBeInTheDocument();
		expect(screen.queryByTestId('integration-update-button')).toBeNull();
	});
});
