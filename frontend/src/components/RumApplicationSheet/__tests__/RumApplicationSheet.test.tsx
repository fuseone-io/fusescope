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
	last4: 'rt4w',
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

function mockServer(created: { body?: unknown }, app: object = APP): void {
	server.use(
		rest.post(APPS_URL, async (req, res, ctx) => {
			created.body = await req.json();
			return res(
				ctx.status(201),
				ctx.json(
					ok({
						...app,
						key: { ...KEY, key: 'rum_pub_h3vq7zk2mx5cn4lw6rtp2jdy5beart4w' },
					}),
				),
			);
		}),
		rest.get(`${APPS_URL}/app-1`, (_req, res, ctx) => res(ctx.json(ok(app)))),
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
			'rum_pub_h3vq7zk2mx5cn4lw6rtp2jdy5beart4w',
		);
		expect(created.body).toMatchObject({
			name: 'web-shop',
			platform: 'web',
			environment: 'production',
			allowedOrigins: ['https://shop.example.com'],
			sampleRate: 1,
		});
		expect(screen.getByTestId('rum-install-snippet')).toHaveTextContent(
			"publicKey: 'rum_pub_h3vq7zk2mx5cn4lw6rtp2jdy5beart4w'",
		);
		await expect(screen.findByTestId('rum-rejection')).resolves.toHaveTextContent(
			'origin http://localhost:3360 is not allowed',
		);
		expect(screen.getByTestId('rum-setup-status')).toHaveAttribute(
			'data-state',
			'waiting',
		);
	});

	it('creates an Android application with package names, then shows the Gradle setup', async () => {
		const created: { body?: unknown } = {};
		mockServer(created, {
			...APP,
			name: 'shop-android',
			platform: 'android',
			allowedOrigins: [],
			allowedPackageNames: ['com.example.shop'],
		});
		const user = userEvent.setup({ pointerEventsCheck: 0 });
		render(<RumApplicationSheet target={{ mode: 'new' }} onClose={jest.fn()} />);

		await user.click(screen.getByTestId('rum-app-platform-android'));
		expect(screen.queryByTestId('rum-app-origins-input')).not.toBeInTheDocument();
		await user.type(screen.getByTestId('rum-app-name'), 'shop-android');
		await user.type(
			screen.getByTestId('rum-app-packages-input'),
			'com.example.shop{Enter}',
		);
		await user.click(screen.getByTestId('rum-app-submit'));

		await expect(
			screen.findByTestId('rum-install-gradle'),
		).resolves.toHaveTextContent(
			'implementation("io.fuseone.fusescope:android:0.1.0-beta.1")',
		);
		expect(created.body).toMatchObject({
			name: 'shop-android',
			platform: 'android',
			allowedOrigins: [],
			allowedPackageNames: ['com.example.shop'],
		});
		expect(screen.getByTestId('rum-install-snippet')).toHaveTextContent(
			'key = "rum_pub_h3vq7zk2mx5cn4lw6rtp2jdy5beart4w"',
		);
		expect(screen.getByTestId('rum-install-mapping')).toHaveTextContent(
			'applicationId.set("app-1")',
		);
	});

	it('offers no origin to add for an Android application', async () => {
		mockServer({}, { ...APP, platform: 'android', allowedOrigins: [] });
		render(
			<RumApplicationSheet
				target={{ mode: 'edit', applicationId: 'app-1' }}
				initialTab="install"
				onClose={jest.fn()}
			/>,
		);

		await expect(screen.findByTestId('rum-rejection')).resolves.toHaveTextContent(
			'origin http://localhost:3360 is not allowed',
		);
		expect(
			screen.queryByTestId('rum-rejection-add-origin'),
		).not.toBeInTheDocument();
	});

	it('refuses a package name that is not an applicationId', async () => {
		mockServer({});
		const user = userEvent.setup({ pointerEventsCheck: 0 });
		render(<RumApplicationSheet target={{ mode: 'new' }} onClose={jest.fn()} />);

		await user.click(screen.getByTestId('rum-app-platform-android'));
		await user.type(screen.getByTestId('rum-app-packages-input'), 'shop{Enter}');
		expect(screen.getByRole('alert')).toHaveTextContent(
			'Use the applicationId, e.g. com.example.shop or com.example.*',
		);
	});

	it('shows the country lookup as coming soon, off and disabled', async () => {
		const created: { body?: unknown } = {};
		mockServer(created);
		const user = userEvent.setup({ pointerEventsCheck: 0 });
		render(<RumApplicationSheet target={{ mode: 'new' }} onClose={jest.fn()} />);

		const geoLookup = screen.getByTestId('rum-app-geoLookup');
		expect(geoLookup).toBeDisabled();
		expect(geoLookup).not.toBeChecked();
		expect(screen.getByTestId('rum-app-geoLookup-soon')).toHaveTextContent(
			'Soon',
		);

		await user.type(screen.getByTestId('rum-app-name'), 'web-shop');
		await user.click(screen.getByTestId('rum-app-submit'));
		await waitFor(() =>
			expect(created.body).toMatchObject({ piiPolicy: { geoLookup: false } }),
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
