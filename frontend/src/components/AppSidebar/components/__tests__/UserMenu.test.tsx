import { logEventMock } from '__tests__/logEventMock';
import { Logout } from 'api/utils';
import ROUTES from 'constants/routes';
import { useGetTenantLicense } from 'hooks/useGetTenantLicense';
import { screen, userEvent, within } from 'tests/test-utils';

import { renderAppSidebar } from '../../__tests__/renderAppSidebar';

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

const mockLicense = jest.mocked(useGetTenantLicense);

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
});
