import userEvent from '@testing-library/user-event';
import { server } from 'mocks-server/server';
import { rest } from 'msw';
import { render, screen, waitFor, within } from 'tests/test-utils';

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

	it('shows viewers the applications read-only', async () => {
		mockApplications([APP]);
		render(<RumApplications />, undefined, { role: 'VIEWER' });

		await expect(
			screen.findByTestId('rum-application-row'),
		).resolves.toBeInTheDocument();
		expect(
			screen.queryByTestId('rum-applications-unavailable'),
		).not.toBeInTheDocument();
		expect(screen.queryByTestId('rum-applications-new')).not.toBeInTheDocument();
	});

	it('counts one application in the singular', async () => {
		mockApplications([APP]);
		render(<RumApplications />);

		await waitFor(() =>
			expect(screen.getByTestId('rum-applications-count')).toHaveTextContent(
				/^1 application · 50 sessions in the selected range$/,
			),
		);
		expect(screen.getByTestId('rum-applications-shown')).toHaveTextContent(
			/^1 of 1 application$/,
		);
	});

	it('counts several applications in the plural', async () => {
		mockApplications([APP, { ...APP, id: 'app-2', name: 'checkout' }]);
		render(<RumApplications />);

		await expect(
			screen.findByTestId('rum-applications-count'),
		).resolves.toHaveTextContent(/^2 applications ·/);
		expect(screen.getByTestId('rum-applications-shown')).toHaveTextContent(
			/^2 of 2 applications$/,
		);
	});

	it('filters by the Android platform', async () => {
		const user = userEvent.setup({ pointerEventsCheck: 0 });
		mockApplications([
			APP,
			{ ...APP, id: 'app-2', name: 'shop-android', platform: 'android' },
		]);
		render(<RumApplications />);

		await waitFor(() =>
			expect(screen.getByTestId('rum-applications-shown')).toHaveTextContent(
				/^2 of 2 applications$/,
			),
		);
		const android = screen.getByTestId('rum-platform-android');
		expect(android).toBeEnabled();
		expect(android).not.toHaveTextContent(/soon/i);
		expect(screen.getByTestId('rum-platform-ios')).toBeDisabled();

		await user.click(android);
		await waitFor(() =>
			expect(screen.getByTestId('rum-applications-shown')).toHaveTextContent(
				/^1 of 2 applications$/,
			),
		);
	});

	it('says when the list cannot be loaded', async () => {
		server.use(
			rest.get(APPS_URL, (_req, res, ctx) =>
				res(
					ctx.status(500),
					ctx.json({ status: 'error', error: { message: 'boom' } }),
				),
			),
		);
		render(<RumApplications />);

		await expect(
			screen.findByTestId('rum-applications-unavailable'),
		).resolves.toHaveTextContent('Applications could not be loaded');
	});
});
