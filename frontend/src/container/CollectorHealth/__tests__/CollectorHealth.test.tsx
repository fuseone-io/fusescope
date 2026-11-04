import { rest, server } from 'mocks-server/server';
import { render, screen } from 'tests/test-utils';

import CollectorHealth from '..';

// The full V2 DashboardContainer needs a data router this test does not set
// up; what matters here is which dashboard it is given.
jest.mock('pages/DashboardPage/DashboardContainer', () => ({
	__esModule: true,
	default: ({
		dashboard,
	}: {
		dashboard: { id: string; name: string };
	}): JSX.Element => (
		<div data-testid="collector-health-dashboard">
			{dashboard.id} {dashboard.name}
		</div>
	),
}));

const SYSTEM_DASHBOARD_ENDPOINT =
	'*/api/v2/dashboards/system/fusescope-collector';

describe('CollectorHealth', () => {
	it('renders the FuseScope collector system dashboard, read-only', async () => {
		server.use(
			rest.get(SYSTEM_DASHBOARD_ENDPOINT, (_req, res, ctx) =>
				res(
					ctx.status(200),
					ctx.json({
						status: 'success',
						data: {
							orgId: 'org',
							locked: true,
							name: 'signoz---fusescope-collector',
							schemaVersion: 'v6',
							source: 'system',
							tags: null,
							spec: {
								display: { name: 'FuseScope Collector' },
								variables: [],
								panels: {},
								layouts: [],
							},
						},
					}),
				),
			),
		);

		render(<CollectorHealth />);

		const container = await screen.findByTestId('collector-health-dashboard');
		expect(container).toHaveTextContent(
			'fusescope-collector-health signoz---fusescope-collector',
		);
	});

	it('says why when the dashboard cannot be loaded', async () => {
		server.use(
			rest.get(SYSTEM_DASHBOARD_ENDPOINT, (_req, res, ctx) =>
				res(
					ctx.status(404),
					ctx.json({
						status: 'error',
						error: { code: 'not_found', message: 'system dashboard not found' },
					}),
				),
			),
		);

		render(<CollectorHealth />);

		const message = await screen.findByText('Failed to load dashboard');
		expect(message).toBeInTheDocument();
		expect(screen.queryByTestId('collector-health-dashboard')).toBeNull();
	});
});
