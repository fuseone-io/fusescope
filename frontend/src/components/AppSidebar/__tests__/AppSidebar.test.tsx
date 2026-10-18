import { logEventMock } from '__tests__/logEventMock';
import ROUTES from 'constants/routes';
import { USER_PREFERENCES } from 'constants/userPreferences';
import { useGetTenantLicense } from 'hooks/useGetTenantLicense';
import { useIsAIAssistantEnabled } from 'hooks/useIsAIAssistantEnabled';
import { rest, server } from 'mocks-server/server';
import {
	fireEvent,
	screen,
	userEvent,
	waitFor,
	within,
} from 'tests/test-utils';

import { preference, renderAppSidebar, sidebarState } from './renderAppSidebar';

const mockPush = jest.fn();

jest.mock('lib/history', () => ({
	__esModule: true,
	default: {
		push: (...args: unknown[]): void => mockPush(...args),
		location: { pathname: '/home' },
	},
}));

jest.mock('hooks/useGetTenantLicense', () => ({
	useGetTenantLicense: jest.fn(),
}));

jest.mock('hooks/useIsAIAssistantEnabled', () => ({
	useIsAIAssistantEnabled: jest.fn(),
}));

const mockLicense = jest.mocked(useGetTenantLicense);
const mockAIAssistant = jest.mocked(useIsAIAssistantEnabled);

const COMMUNITY = {
	isCloudUser: false,
	isEnterpriseSelfHostedUser: false,
	isCommunityUser: true,
	isCommunityEnterpriseUser: false,
};

const CLOUD = { ...COMMUNITY, isCommunityUser: false, isCloudUser: true };

interface PreferenceWrite {
	name: string;
	value: unknown;
}

function capturePreferenceWrites(): PreferenceWrite[] {
	const writes: PreferenceWrite[] = [];
	server.use(
		rest.put('*/api/v1/user/preferences/:name', async (req, res, ctx) => {
			const body = await req.json();
			writes.push({ name: String(req.params.name), value: body.value });
			return res(ctx.status(204));
		}),
	);
	return writes;
}

function navLink(name: string): HTMLElement {
	return within(screen.getByTestId('app-sidebar')).getByRole('link', {
		name,
	});
}

describe('AppSidebar', () => {
	beforeEach(() => {
		mockLicense.mockReturnValue(COMMUNITY);
		mockAIAssistant.mockReturnValue(false);
		window.localStorage.clear();
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	describe('collapse and expand', () => {
		it('opens expanded when the side nav is pinned and collapsed otherwise', () => {
			const { unmount } = renderAppSidebar({ pinned: true });
			expect(sidebarState()).toBe('expanded');
			unmount();

			renderAppSidebar({ pinned: false });
			expect(sidebarState()).toBe('collapsed');
		});

		it('toggles with the trigger button and persists the new state', async () => {
			const writes = capturePreferenceWrites();
			const onPreferenceUpdate = jest.fn();
			const user = userEvent.setup();
			renderAppSidebar({ pinned: false, onPreferenceUpdate });

			await user.click(screen.getByTestId('app-sidebar-trigger'));

			expect(sidebarState()).toBe('expanded');
			expect(onPreferenceUpdate).toHaveBeenCalledWith(
				expect.objectContaining({
					name: USER_PREFERENCES.SIDENAV_PINNED,
					value: true,
				}),
			);
			await waitFor(() =>
				expect(writes).toStrictEqual([
					{ name: USER_PREFERENCES.SIDENAV_PINNED, value: true },
				]),
			);
			expect(window.localStorage.getItem(USER_PREFERENCES.SIDENAV_PINNED)).toBe(
				'true',
			);

			await user.click(screen.getByTestId('app-sidebar-trigger'));

			expect(sidebarState()).toBe('collapsed');
			await waitFor(() =>
				expect(writes).toContainEqual({
					name: USER_PREFERENCES.SIDENAV_PINNED,
					value: false,
				}),
			);
		});

		it.each([
			{ shortcut: 'Ctrl+B', modifier: { ctrlKey: true } },
			{ shortcut: '⌘+B', modifier: { metaKey: true } },
		])('toggles with $shortcut and persists it', async ({ modifier }) => {
			const writes = capturePreferenceWrites();
			renderAppSidebar({ pinned: true });

			fireEvent.keyDown(window, { key: 'b', ...modifier });

			expect(sidebarState()).toBe('collapsed');
			await waitFor(() =>
				expect(writes).toStrictEqual([
					{ name: USER_PREFERENCES.SIDENAV_PINNED, value: false },
				]),
			);

			fireEvent.keyDown(window, { key: 'b', ...modifier });
			expect(sidebarState()).toBe('expanded');
		});

		it('toggles with Shift+B and logs it', async () => {
			const user = userEvent.setup();
			renderAppSidebar({ pinned: false });

			await user.keyboard('{Shift>}b{/Shift}');

			expect(sidebarState()).toBe('expanded');
			expect(logEventMock).toHaveBeenCalledWith(
				'Global Shortcut: Sidebar Toggle',
				{
					previousState: false,
					newState: true,
				},
			);
		});

		it('does not expand on hover', async () => {
			const user = userEvent.setup();
			renderAppSidebar({ pinned: false });

			await user.hover(screen.getByTestId('app-sidebar'));
			await user.hover(navLink('Logs'));

			expect(sidebarState()).toBe('collapsed');
		});

		it('does not write the shadcn sidebar cookie', async () => {
			const user = userEvent.setup();
			renderAppSidebar({ pinned: false });

			await user.click(screen.getByTestId('app-sidebar-trigger'));

			expect(document.cookie).not.toContain('sidebar_state');
		});
	});

	describe('collapsed rail', () => {
		it('keeps every item reachable by its accessible name', () => {
			renderAppSidebar({ pinned: false });

			[
				'Home',
				'Services',
				'Traces',
				'Logs',
				'Metrics',
				'Dashboards',
				'Alerts',
				'Exceptions',
				'Settings',
			].forEach((name) => expect(navLink(name)).toBeInTheDocument());
		});

		it('shows the label as a tooltip on focus', async () => {
			const user = userEvent.setup();
			renderAppSidebar({ pinned: false });

			navLink('Traces').focus();
			await user.keyboard('{Shift}');

			await expect(screen.findByRole('tooltip')).resolves.toHaveTextContent(
				'Traces',
			);
		});

		it('shows no item tooltips when expanded', async () => {
			renderAppSidebar({ pinned: true });

			navLink('Traces').focus();

			await waitFor(() =>
				expect(screen.queryByRole('tooltip')).not.toBeInTheDocument(),
			);
		});
	});

	describe('footer', () => {
		it.each([
			{ name: 'Settings', target: (): HTMLElement => navLink('Settings') },
			{
				name: 'Help & Support',
				target: (): HTMLElement =>
					screen.getByRole('button', { name: 'Help & Support' }),
			},
		])(
			'names the $name icon button in a tooltip when expanded',
			async ({ name, target }) => {
				const user = userEvent.setup();
				renderAppSidebar({ pinned: true });

				target().focus();
				await user.keyboard('{Shift}');

				await expect(screen.findByRole('tooltip')).resolves.toHaveTextContent(name);
			},
		);
	});

	describe('items', () => {
		it('groups items under section labels', () => {
			renderAppSidebar({ pinned: true });

			const observe = screen.getByRole('list', { name: 'Observe' });
			expect(
				within(observe).getByRole('link', { name: 'Services' }),
			).toBeVisible();
			const respond = screen.getByRole('list', { name: 'Respond' });
			expect(within(respond).getByRole('link', { name: 'Alerts' })).toBeVisible();
		});

		it('shows the Beta badge on AI Observability', () => {
			renderAppSidebar({ pinned: true });

			expect(navLink('AI Observability Beta')).toBeInTheDocument();
		});

		it('hides Integrations from community users and viewers', () => {
			renderAppSidebar({ pinned: true });

			expect(
				within(screen.getByTestId('app-sidebar')).queryByRole('link', {
					name: 'Integrations',
				}),
			).not.toBeInTheDocument();
		});

		it('shows Integrations to cloud admins', () => {
			mockLicense.mockReturnValue(CLOUD);
			renderAppSidebar({ pinned: true });

			expect(navLink('Integrations')).toBeInTheDocument();
		});

		it('hides Integrations from cloud viewers', () => {
			mockLicense.mockReturnValue(CLOUD);
			renderAppSidebar({ pinned: true, role: 'VIEWER' });

			expect(
				within(screen.getByTestId('app-sidebar')).queryByRole('link', {
					name: 'Integrations',
				}),
			).not.toBeInTheDocument();
		});

		it('shows the new source button to cloud users who are not viewers', () => {
			mockLicense.mockReturnValue(CLOUD);
			const { unmount } = renderAppSidebar({ pinned: true });
			expect(screen.getByRole('button', { name: 'New source' })).toBeVisible();
			unmount();

			renderAppSidebar({ pinned: true, role: 'VIEWER' });
			expect(
				screen.queryByRole('button', { name: 'New source' }),
			).not.toBeInTheDocument();
		});

		it('shows Noz only when the AI assistant is enabled', () => {
			const { unmount } = renderAppSidebar({ pinned: true });
			expect(screen.queryByText('Noz')).not.toBeInTheDocument();
			unmount();

			mockAIAssistant.mockReturnValue(true);
			renderAppSidebar({ pinned: true });
			expect(navLink('Noz Early Access')).toBeInTheDocument();
		});

		it('disables navigation while the workspace is locked', async () => {
			const user = userEvent.setup();
			renderAppSidebar({
				pinned: true,
				overrides: {
					trialInfo: {
						trialStart: -1,
						trialEnd: -1,
						onTrial: false,
						workSpaceBlock: true,
						trialConvertedToSubscription: false,
						gracePeriodEnd: -1,
					},
				},
			});

			expect(navLink('Logs')).toHaveAttribute('aria-disabled', 'true');
			await user.click(navLink('Logs'));
			expect(mockPush).not.toHaveBeenCalled();
		});
	});

	describe('active route', () => {
		it.each([
			{ route: '/logs/logs-explorer', active: 'Logs' },
			{ route: '/trace', active: 'Traces' },
			{ route: '/dashboard/some-id', active: 'Dashboards' },
			{ route: '/infrastructure-monitoring/kubernetes', active: 'Infrastructure' },
			{ route: ROUTES.MY_SETTINGS, active: 'Settings' },
		])('highlights $active on $route', ({ route, active }) => {
			renderAppSidebar({ pinned: true, route });

			expect(navLink(active)).toHaveAttribute('aria-current', 'page');
			expect(navLink('Home')).not.toHaveAttribute('aria-current');
		});
	});

	describe('navigation', () => {
		it('pushes the route, keeping its query params, and logs the click', async () => {
			const user = userEvent.setup();
			renderAppSidebar({
				pinned: true,
				route: '/home?resourceAttribute=abc&other=1',
			});

			await user.click(navLink('Dashboards'));

			expect(mockPush).toHaveBeenCalledWith(
				`${ROUTES.ALL_DASHBOARD}?resourceAttribute=abc`,
				{ from: '/home' },
			);
			expect(logEventMock).toHaveBeenCalledWith('Sidebar V2: Menu clicked', {
				menuRoute: ROUTES.ALL_DASHBOARD,
				menuLabel: 'Dashboards',
			});
		});

		it('keeps the Shift+<key> page shortcuts', async () => {
			const user = userEvent.setup();
			renderAppSidebar({ pinned: true });

			await user.keyboard('{Shift>}d{/Shift}');

			expect(mockPush).toHaveBeenCalledWith(`${ROUTES.ALL_DASHBOARD}?`, {
				from: '/home',
			});
		});

		it('opens a new tab on a modifier click', async () => {
			const open = jest.spyOn(window, 'open').mockImplementation(() => null);
			const user = userEvent.setup();
			renderAppSidebar({ pinned: true });

			await user.keyboard('{Control>}');
			await user.click(navLink('Logs'));

			expect(open).toHaveBeenCalledWith(
				expect.stringContaining(ROUTES.LOGS),
				'_blank',
			);
			expect(mockPush).not.toHaveBeenCalled();
		});
	});

	describe('shortcuts', () => {
		it('lists saved shortcuts in their own group', () => {
			renderAppSidebar({
				pinned: true,
				preferences: [preference(USER_PREFERENCES.NAV_SHORTCUTS, ['logs'])],
			});

			const shortcuts = screen.getByRole('list', { name: 'Shortcuts' });
			expect(within(shortcuts).getByRole('link', { name: 'Logs' })).toBeVisible();
		});

		it('has no shortcuts group until one is added', () => {
			renderAppSidebar({ pinned: true });

			expect(
				screen.queryByRole('list', { name: 'Shortcuts' }),
			).not.toBeInTheDocument();
		});

		it('adds and removes a shortcut, saving the list', async () => {
			const writes = capturePreferenceWrites();
			const user = userEvent.setup();
			renderAppSidebar({
				pinned: true,
				preferences: [preference(USER_PREFERENCES.NAV_SHORTCUTS, ['logs'])],
			});

			await user.click(
				screen.getByRole('button', { name: 'Add Traces to shortcuts' }),
			);

			const shortcuts = screen.getByRole('list', { name: 'Shortcuts' });
			expect(
				within(shortcuts).getByRole('link', { name: 'Traces' }),
			).toBeVisible();
			await waitFor(() =>
				expect(writes).toContainEqual({
					name: USER_PREFERENCES.NAV_SHORTCUTS,
					value: ['logs', 'traces'],
				}),
			);
			expect(logEventMock).toHaveBeenCalledWith('Sidebar V2: Menu item pinned', {
				menuRoute: ROUTES.TRACES_EXPLORER,
				menuLabel: 'Traces',
			});

			await user.click(
				within(shortcuts).getByRole('button', {
					name: 'Remove Logs from shortcuts',
				}),
			);
			await waitFor(() =>
				expect(writes).toContainEqual({
					name: USER_PREFERENCES.NAV_SHORTCUTS,
					value: ['traces'],
				}),
			);
		});
	});
});
