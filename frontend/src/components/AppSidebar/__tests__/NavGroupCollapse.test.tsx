import { USER_PREFERENCES } from 'constants/userPreferences';
import { useGetTenantLicense } from 'hooks/useGetTenantLicense';
import { useIsAIAssistantEnabled } from 'hooks/useIsAIAssistantEnabled';
import { screen, userEvent, within } from 'tests/test-utils';

import { preference, renderAppSidebar } from './renderAppSidebar';

jest.mock('lib/history', () => ({
	__esModule: true,
	default: { push: jest.fn(), location: { pathname: '/home' } },
}));

jest.mock('hooks/useGetTenantLicense', () => ({
	useGetTenantLicense: jest.fn(),
}));

jest.mock('hooks/useIsAIAssistantEnabled', () => ({
	useIsAIAssistantEnabled: jest.fn(),
}));

function groupToggle(name: string): HTMLElement {
	return screen.getByRole('button', { name });
}

function queryNavLink(name: string): HTMLElement | null {
	return within(screen.getByTestId('app-sidebar')).queryByRole('link', {
		name,
	});
}

/** Collapses `groups` in one session so the next render starts from them. */
async function collapseInPreviousSession(groups: string[]): Promise<void> {
	const user = userEvent.setup();
	const { unmount } = renderAppSidebar({ pinned: true });
	for (const group of groups) {
		await user.click(groupToggle(group));
	}
	unmount();
}

describe('AppSidebar collapsible groups', () => {
	beforeEach(() => {
		jest.mocked(useGetTenantLicense).mockReturnValue({
			isCloudUser: false,
			isEnterpriseSelfHostedUser: false,
			isCommunityUser: true,
			isCommunityEnterpriseUser: false,
		});
		jest.mocked(useIsAIAssistantEnabled).mockReturnValue(false);
		window.localStorage.clear();
	});

	it('collapses and expands a group from its label', async () => {
		const user = userEvent.setup();
		renderAppSidebar({ pinned: true });

		expect(groupToggle('Respond')).toHaveAttribute('aria-expanded', 'true');

		await user.click(groupToggle('Respond'));

		expect(groupToggle('Respond')).toHaveAttribute('aria-expanded', 'false');
		expect(queryNavLink('Alerts')).not.toBeInTheDocument();
		expect(queryNavLink('Logs')).toBeInTheDocument();

		await user.click(groupToggle('Respond'));

		expect(groupToggle('Respond')).toHaveAttribute('aria-expanded', 'true');
		expect(queryNavLink('Alerts')).toBeInTheDocument();
	});

	it('toggles a group with the keyboard', async () => {
		const user = userEvent.setup();
		renderAppSidebar({ pinned: true });

		groupToggle('Analyze').focus();
		await user.keyboard('{Enter}');
		expect(groupToggle('Analyze')).toHaveAttribute('aria-expanded', 'false');

		await user.keyboard(' ');
		expect(groupToggle('Analyze')).toHaveAttribute('aria-expanded', 'true');
	});

	it('collapses the Shortcuts group', async () => {
		const user = userEvent.setup();
		renderAppSidebar({
			pinned: true,
			preferences: [preference(USER_PREFERENCES.NAV_SHORTCUTS, ['alerts'])],
		});

		await user.click(groupToggle('Shortcuts'));

		expect(
			screen.queryByRole('list', { name: 'Shortcuts' }),
		).not.toBeInTheDocument();
		expect(screen.getByRole('list', { name: 'Respond' })).toContainElement(
			queryNavLink('Alerts'),
		);
	});

	it('restores collapsed groups in the next session', async () => {
		await collapseInPreviousSession(['Respond', 'Analyze']);

		renderAppSidebar({ pinned: true });

		expect(groupToggle('Respond')).toHaveAttribute('aria-expanded', 'false');
		expect(groupToggle('Analyze')).toHaveAttribute('aria-expanded', 'false');
		expect(groupToggle('Observe')).toHaveAttribute('aria-expanded', 'true');
		expect(queryNavLink('Alerts')).not.toBeInTheDocument();
	});

	it('ignores an unreadable saved state', () => {
		window.localStorage.setItem('fusescope.sidebar.collapsedGroups', '{oops');

		renderAppSidebar({ pinned: true });

		expect(groupToggle('Respond')).toHaveAttribute('aria-expanded', 'true');
	});

	it('expands the collapsed group holding the active route', async () => {
		await collapseInPreviousSession(['Observe', 'Respond']);

		renderAppSidebar({ pinned: true, route: '/logs/logs-explorer' });

		expect(groupToggle('Observe')).toHaveAttribute('aria-expanded', 'true');
		expect(queryNavLink('Logs')).toHaveAttribute('aria-current', 'page');
		expect(groupToggle('Respond')).toHaveAttribute('aria-expanded', 'false');
	});

	it('leaves the groups alone when a shortcut already shows the active route', async () => {
		const user = userEvent.setup();
		const { unmount } = renderAppSidebar({
			pinned: true,
			preferences: [preference(USER_PREFERENCES.NAV_SHORTCUTS, ['logs'])],
		});
		await user.click(groupToggle('Observe'));
		unmount();

		renderAppSidebar({
			pinned: true,
			route: '/logs/logs-explorer',
			preferences: [preference(USER_PREFERENCES.NAV_SHORTCUTS, ['logs'])],
		});

		expect(groupToggle('Observe')).toHaveAttribute('aria-expanded', 'false');
		expect(queryNavLink('Logs')).toHaveAttribute('aria-current', 'page');
	});

	it('shows every icon in the collapsed rail, ignoring collapsed groups', async () => {
		await collapseInPreviousSession(['Observe', 'Respond']);

		renderAppSidebar({ pinned: false });

		expect(queryNavLink('Services')).toBeInTheDocument();
		expect(queryNavLink('Alerts')).toBeInTheDocument();
		expect(
			screen.queryByRole('button', { name: 'Observe' }),
		).not.toBeInTheDocument();
	});
});
