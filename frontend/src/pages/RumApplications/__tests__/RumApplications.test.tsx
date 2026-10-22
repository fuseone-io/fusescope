import { server } from 'mocks-server/server';
import { rest } from 'msw';
import { render, screen, within } from 'tests/test-utils';

import RumApplications from '../index';

const APPS_URL = 'http://localhost/api/v1/rum/applications';
const QUERY_URL = 'http://localhost/api/v5/query_range';

const APP = {
	id: 'app-1',
	orgId: 'org',
	name: 'web-shop',
	platform: 'web',
	environment: 'production',
	allowedOrigins: ['https://shop.example.com'],
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

function scalar(
	queryName: string,
	groups: string[],
	data: unknown[][],
): unknown {
	const width = (data[0]?.length ?? groups.length) - groups.length;
	return {
		queryName,
		columns: [
			...groups.map((name) => ({ name, queryName, columnType: 'group' })),
			...Array.from({ length: width }, (_, index) => ({
				name: `__result_${index}`,
				queryName,
				aggregationIndex: index,
				columnType: 'aggregation',
			})),
		],
		data,
	};
}

function mockApplications(applications: unknown[]): void {
	server.use(
		rest.get(APPS_URL, (_req, res, ctx) =>
			res(ctx.status(200), ctx.json({ status: 'success', data: applications })),
		),
		rest.get(`${APPS_URL}/:id/status`, (_req, res, ctx) =>
			res(
				ctx.status(200),
				ctx.json({ status: 'success', data: { supportedSdks: [] } }),
			),
		),
		rest.post(QUERY_URL, (_req, res, ctx) =>
			res(
				ctx.status(200),
				ctx.json({
					status: 'success',
					data: {
						type: 'scalar',
						data: {
							results: [
								scalar(
									'S',
									['fusescope.rum.application.id'],
									[['app-1', 50, 120, '2026-10-21T10:00:00Z']],
								),
								scalar('E', ['fusescope.rum.application.id'], [['app-1', 2]]),
							],
						},
					},
				}),
			),
		),
	);
}

describe('RumApplications', () => {
	it('explains RUM and offers to create the first application', async () => {
		mockApplications([]);
		render(<RumApplications />);

		await expect(
			screen.findByTestId('rum-applications-empty'),
		).resolves.toBeInTheDocument();
		expect(screen.getByTestId('rum-empty-create')).toBeVisible();
	});

	it('lists applications with sessions and the session error rate', async () => {
		mockApplications([APP]);
		render(<RumApplications />);

		const row = await screen.findByTestId('rum-application-row');
		expect(within(row).getByText('web-shop')).toBeInTheDocument();
		await expect(within(row).findByText('4.0%')).resolves.toBeInTheDocument();
		expect(within(row).getByTestId('rum-application-sessions')).toHaveTextContent(
			'50',
		);
	});

	it('hides creation from viewers', async () => {
		mockApplications([]);
		render(<RumApplications />, undefined, { role: 'VIEWER' });

		await expect(
			screen.findByTestId('rum-applications-empty'),
		).resolves.toBeInTheDocument();
		expect(screen.queryByTestId('rum-empty-create')).not.toBeInTheDocument();
		expect(screen.queryByTestId('rum-applications-new')).not.toBeInTheDocument();
	});

	it('explains when the list is not allowed', async () => {
		server.use(
			rest.get(APPS_URL, (_req, res, ctx) =>
				res(
					ctx.status(403),
					ctx.json({ status: 'error', error: { message: 'forbidden' } }),
				),
			),
		);
		render(<RumApplications />, undefined, { role: 'VIEWER' });

		await expect(
			screen.findByTestId('rum-applications-unavailable'),
		).resolves.toHaveTextContent('managed by admins and editors');
	});
});
