import { Route } from 'react-router-dom';
import { server } from 'mocks-server/server';
import { rest } from 'msw';
import { render, screen } from 'tests/test-utils';

import RumApplication from '../index';

const APP = {
	id: 'app-1',
	orgId: 'org',
	name: 'web-shop',
	platform: 'web',
	environment: 'production',
	allowedOrigins: [],
	tracePropagationUrls: [],
	sampleRate: 1,
	createdBy: 'admin',
	firstSeenAt: null,
	piiPolicy: {
		dropQuery: true,
		queryAllowlist: [],
		urlAllowlist: [],
		geoLookup: true,
		requireConsent: false,
		hashUserId: true,
	},
};

function renderPage(): void {
	render(
		<Route path="/frontend/applications/:id">
			<RumApplication />
		</Route>,
		undefined,
		{ initialRoute: '/frontend/applications/app-1' },
	);
}

describe('RumApplication', () => {
	it('shows the overview and marks the tabs that are coming', async () => {
		server.use(
			rest.get('*/api/v1/rum/applications/app-1', (_req, res, ctx) =>
				res(ctx.json({ status: 'success', data: APP })),
			),
		);
		renderPage();

		await expect(
			screen.findByRole('heading', { name: 'web-shop' }),
		).resolves.toBeInTheDocument();
		expect(screen.getByTestId('page-tab-overview')).toHaveAttribute(
			'aria-selected',
			'true',
		);
		['views', 'errors', 'sessions'].forEach((tab) => {
			expect(screen.getByTestId(`page-tab-${tab}`)).toBeDisabled();
			expect(screen.getByTestId(`page-tab-${tab}`)).toHaveTextContent('Soon');
		});
	});

	it('says so when the application cannot be loaded', async () => {
		server.use(
			rest.get('*/api/v1/rum/applications/app-1', (_req, res, ctx) =>
				res(
					ctx.status(404),
					ctx.json({ status: 'error', error: { message: 'not found' } }),
				),
			),
		);
		renderPage();

		await expect(
			screen.findByTestId('rum-application-not-found'),
		).resolves.toBeInTheDocument();
	});
});
