import { logEventMock } from '__tests__/logEventMock';
import { Logout } from 'api/utils';
import ROUTES from 'constants/routes';
import { useGetTenantLicense } from 'hooks/useGetTenantLicense';
import { screen, userEvent, within } from 'tests/test-utils';

import { renderAppSidebar } from '../../__tests__/renderAppSidebar';
import { useVersionInfo, VersionInfo } from '../../hooks/useVersionInfo';

const mockPush = jest.fn();

jest.mock('lib/history', () => ({
	__esModule: true,
	default: {
		push: (...args: unknown[]): void => mockPush(...args),
		location: { pathname: '/home' },
	},
}));

jest.mock('api/utils', () => ({
	Logout: jest.fn(),
}));

jest.mock('hooks/useGetTenantLicense', () => ({
	useGetTenantLicense: jest.fn(),
}));

jest.mock('hooks/useIsAIAssistantEnabled', () => ({
	useIsAIAssistantEnabled: (): boolean => false,
}));

jest.mock('components/AppSidebar/hooks/useVersionInfo', () => ({
	useVersionInfo: jest.fn(),
}));

const mockLicense = jest.mocked(useGetTenantLicense);
const mockVersionInfo = jest.mocked(useVersionInfo);

function versionInfo(
	currentVersion: string,
	latestVersion = currentVersion,
): VersionInfo {
	return {
		currentVersion,
		latestVersion,
		isUpdateAvailable: currentVersion !== latestVersion,
	};
}

const COMMUNITY = {
	isCloudUser: false,
	isEnterpriseSelfHostedUser: false,
	isCommunityUser: true,
	isCommunityEnterpriseUser: false,
};

const LOCKED_TRIAL = {
	trialStart: -1,
	trialEnd: -1,
	onTrial: false,
	workSpaceBlock: true,
	trialConvertedToSubscription: false,
	gracePeriodEnd: -1,
};

async function openUserMenu(): Promise<HTMLElement> {
	await userEvent
		.setup({ pointerEventsCheck: 0 })
		.click(screen.getByTestId('user-menu-trigger'));
	return screen.findByRole('menu');
}

describe('UserMenu', () => {
	beforeEach(() => {
		mockLicense.mockReturnValue(COMMUNITY);
		mockVersionInfo.mockReturnValue(versionInfo('<unset>'));
	});

	it('shows the user initials, name and role', () => {
		renderAppSidebar({ pinned: true });

		const trigger = screen.getByTestId('user-menu-trigger');
		expect(trigger).toHaveTextContent('JD');
		expect(trigger).toHaveTextContent('John Doe');
		expect(trigger).toHaveTextContent('Admin');
	});

	it('heads the rows with the logged-in user, then signs out last', async () => {
		renderAppSidebar({ pinned: true });

		const menu = await openUserMenu();

		expect(within(menu).getByTestId('logged-in-as-nav-item')).toHaveTextContent(
			'does-not-matter@signoz.io',
		);
		expect(
			within(menu)
				.getAllByRole('menuitem')
				.map((item) => item.textContent),
		).toStrictEqual([
			'Workspace Settings',
			'Account Settings',
			'Keyboard Shortcuts',
			'Sign out',
		]);
	});

	it.each([
		{ license: 'enterprise self-hosted', key: 'isEnterpriseSelfHostedUser' },
		{ license: 'community enterprise', key: 'isCommunityEnterpriseUser' },
	])('offers Manage License to $license users', async ({ key }) => {
		mockLicense.mockReturnValue({
			...COMMUNITY,
			isCommunityUser: false,
			[key]: true,
		});
		renderAppSidebar({ pinned: true });

		const menu = await openUserMenu();

		expect(within(menu).getByTestId('manage-license-nav-item')).toBeVisible();
	});

	it('disables workspace settings with the reason while the workspace is locked', async () => {
		renderAppSidebar({ pinned: true, overrides: { trialInfo: LOCKED_TRIAL } });

		const menu = await openUserMenu();

		const workspace = within(menu).getByTestId('workspace-settings-nav-item');
		expect(workspace).toHaveAttribute('aria-disabled', 'true');
		expect(workspace).toHaveAccessibleDescription(
			'Unavailable while the workspace is locked',
		);
	});

	it('navigates to account settings and logs the pick', async () => {
		renderAppSidebar({ pinned: true });

		const menu = await openUserMenu();
		await userEvent
			.setup({ pointerEventsCheck: 0 })
			.click(within(menu).getByTestId('account-settings-nav-item'));

		expect(mockPush).toHaveBeenCalledWith(ROUTES.MY_SETTINGS);
		expect(logEventMock).toHaveBeenCalledWith('Settings Popover: Item clicked', {
			menuRoute: 'account',
			menuLabel: 'Account Settings',
		});
	});

	it('signs out', async () => {
		renderAppSidebar({ pinned: true });

		const menu = await openUserMenu();
		await userEvent
			.setup({ pointerEventsCheck: 0 })
			.click(within(menu).getByTestId('logout-nav-item'));

		expect(Logout).toHaveBeenCalled();
	});

	it('shows the version below keyboard shortcuts and opens its release notes', async () => {
		const open = jest.spyOn(window, 'open').mockImplementation(() => null);
		mockVersionInfo.mockReturnValue(versionInfo('v0.149.2'));
		renderAppSidebar({ pinned: true });

		expect(screen.queryByTestId('app-sidebar-version')).not.toBeInTheDocument();

		const menu = await openUserMenu();
		const labels = within(menu)
			.getAllByRole('menuitem')
			.map((item) => item.textContent);

		expect(labels.indexOf('Keyboard Shortcuts')).toBe(labels.length - 3);
		expect(within(menu).getByTestId('version-nav-item')).toHaveTextContent(
			'v0.149.2',
		);

		await userEvent
			.setup({ pointerEventsCheck: 0 })
			.click(within(menu).getByTestId('version-nav-item'));

		expect(open).toHaveBeenCalledWith(
			'https://github.com/fuseone-io/fusescope/releases/tag/v0.149.2',
			'_blank',
		);
	});

	it('flags an available update on the version row', async () => {
		mockVersionInfo.mockReturnValue(versionInfo('v0.149.2', 'v0.150.0'));
		renderAppSidebar({ pinned: true });

		const menu = await openUserMenu();

		expect(
			within(within(menu).getByTestId('version-nav-item')).getByLabelText(
				'Update available: v0.150.0',
			),
		).toBeInTheDocument();
	});

	it.each(['', '<unset>'])(
		'hides the version row when the build has none (%p)',
		async (version) => {
			mockVersionInfo.mockReturnValue(versionInfo(version));
			renderAppSidebar({ pinned: true });

			const menu = await openUserMenu();

			expect(
				within(menu).queryByTestId('version-nav-item'),
			).not.toBeInTheDocument();
		},
	);
});
