import { server } from 'mocks-server/server';
import { rest } from 'msw';
import { render, screen, userEvent, waitFor } from 'tests/test-utils';

import RumApplicationSheet from '../RumApplicationSheet';

const APPS_URL = 'http://localhost/api/v1/rum/applications';

const APP = {
	id: 'app-1',
	orgId: 'org',
	name: 'web-shop',
	platform: 'web',
	environment: 'production',
	allowedOrigins: ['https://shop.example.com'],
	tracePropagationUrls: ['https://api.example.com'],
	sampleRate: 0.5,
	createdBy: 'admin',
	createdAt: '2026-10-21T10:00:00Z',
	updatedAt: '2026-10-21T10:00:00Z',
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

const KEY = {
	id: 'key-1',
	applicationId: 'app-1',
	last4: 'Rt4w',
	status: 'active',
	createdAt: '2026-10-21T10:00:00Z',
	expiresAt: null,
	lastUsedAt: null,
};

const STATUS = {
	firstSeenAt: null,
	windowSeconds: 300,
	counts: { sessions: 0, views: 0, errors: 0, vitals: 0 },
	sdk: { name: '', version: '', support: 'unknown' },
	supportedSdks: [],
	rejections: [
		{
			reason: 'origin_not_allowed',
			count: 2,
			lastOrigin: 'http://localhost:3360',
			lastSeenAt: '2026-10-21T10:01:00Z',
		},
	],
};

const ok = (data: unknown) => ({ status: 'success', data });

function mockServer(created: { body?: unknown }): void {
	server.use(
		rest.post(APPS_URL, async (req, res, ctx) => {
			created.body = await req.json();
			return res(
				ctx.status(201),
				ctx.json(
					ok({ ...APP, key: { ...KEY, key: 'rum_pub_8Fh2kQ7vXz3mN9cLRt4w' } }),
				),
			);
		}),
		rest.get(`${APPS_URL}/app-1`, (_req, res, ctx) => res(ctx.json(ok(APP)))),
		rest.get(`${APPS_URL}/app-1/keys`, (_req, res, ctx) =>
			res(ctx.json(ok([KEY]))),
		),
		rest.get(`${APPS_URL}/app-1/status`, (_req, res, ctx) =>
			res(ctx.json(ok(STATUS))),
		),
	);
}

describe('RumApplicationSheet', () => {
	it('creates an application, then shows its key once in the snippet', async () => {
		const created: { body?: unknown } = {};
		mockServer(created);
		const user = userEvent.setup({ pointerEventsCheck: 0 });
		render(<RumApplicationSheet target={{ mode: 'new' }} onClose={jest.fn()} />);

		expect(screen.getByTestId('rum-sheet-tab-install')).toBeDisabled();
		await user.type(screen.getByTestId('rum-app-name'), 'web-shop');
		await user.type(
			screen.getByTestId('rum-app-origins-input'),
			'https://shop.example.com{Enter}',
		);
		await user.click(screen.getByTestId('rum-app-submit'));

		await expect(screen.findByTestId('rum-key-value')).resolves.toHaveTextContent(
			'rum_pub_8Fh2kQ7vXz3mN9cLRt4w',
		);
		expect(created.body).toMatchObject({
			name: 'web-shop',
			platform: 'web',
			environment: 'production',
			allowedOrigins: ['https://shop.example.com'],
			sampleRate: 1,
		});
		expect(screen.getByTestId('rum-install-snippet')).toHaveTextContent(
			"publicKey: 'rum_pub_8Fh2kQ7vXz3mN9cLRt4w'",
		);
		await expect(screen.findByTestId('rum-rejection')).resolves.toHaveTextContent(
			'origin http://localhost:3360 is not allowed',
		);
		expect(screen.getByTestId('rum-setup-status')).toHaveAttribute(
			'data-state',
			'waiting',
		);
	});

	it('refuses an origin with a path', async () => {
		mockServer({});
		const user = userEvent.setup({ pointerEventsCheck: 0 });
		render(<RumApplicationSheet target={{ mode: 'new' }} onClose={jest.fn()} />);

		await user.type(
			screen.getByTestId('rum-app-origins-input'),
			'https://shop.example.com/path{Enter}',
		);
		expect(screen.getByRole('alert')).toHaveTextContent('scheme://host');
		expect(screen.queryByTestId('rum-app-origins-chip')).not.toBeInTheDocument();
	});

	it('shows a viewer the settings read-only', async () => {
		mockServer({});
		render(
			<RumApplicationSheet
				target={{ mode: 'edit', applicationId: 'app-1' }}
				onClose={jest.fn()}
			/>,
			undefined,
			{ role: 'VIEWER' },
		);

		await waitFor(() =>
			expect(screen.getByTestId('rum-app-name')).toHaveValue('web-shop'),
		);
		expect(screen.getByTestId('rum-app-name')).toBeDisabled();
		expect(screen.queryByTestId('rum-app-submit')).not.toBeInTheDocument();
		expect(screen.queryByTestId('rum-app-delete')).not.toBeInTheDocument();
	});

	it('tells a viewer that keys are managed by admins and editors', async () => {
		mockServer({});
		let keysRequested = false;
		server.use(
			rest.get(`${APPS_URL}/app-1/keys`, (_req, res, ctx) => {
				keysRequested = true;
				return res(ctx.status(403));
			}),
		);
		render(
			<RumApplicationSheet
				target={{ mode: 'edit', applicationId: 'app-1' }}
				initialTab="key"
				onClose={jest.fn()}
			/>,
			undefined,
			{ role: 'VIEWER' },
		);

		await expect(
			screen.findByTestId('rum-keys-managed'),
		).resolves.toHaveTextContent('Keys are managed by admins and editors');
		expect(screen.queryByTestId('rum-key-row')).not.toBeInTheDocument();
		expect(screen.queryByTestId('rum-key-rotate')).not.toBeInTheDocument();
		expect(screen.queryByTestId('rum-key-create')).not.toBeInTheDocument();
		expect(keysRequested).toBe(false);
	});
});
