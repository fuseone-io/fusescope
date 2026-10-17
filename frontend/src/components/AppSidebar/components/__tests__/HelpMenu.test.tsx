import { logEventMock } from '__tests__/logEventMock';
import ROUTES from 'constants/routes';
import { useGetTenantLicense } from 'hooks/useGetTenantLicense';
import { screen, userEvent, within } from 'tests/test-utils';
import { ChangelogSchema } from 'types/api/changelog/getChangelogByVersion';

import { renderAppSidebar } from '../../__tests__/renderAppSidebar';

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
	useIsAIAssistantEnabled: (): boolean => false,
}));

jest.mocked(useGetTenantLicense).mockReturnValue({
	isCloudUser: false,
	isEnterpriseSelfHostedUser: false,
	isCommunityUser: true,
	isCommunityEnterpriseUser: false,
});

function changelog(titles: string[]): ChangelogSchema {
	return {
		features: titles.map((title, id) => ({ id, title })),
	} as unknown as ChangelogSchema;
}

async function openHelpMenu(): Promise<HTMLElement> {
	await userEvent
		.setup({ pointerEventsCheck: 0 })
		.click(screen.getByTestId('help-support-nav-item'));
	return screen.findByRole('menu');
}

function itemLabels(menu: HTMLElement): (string | null)[] {
	return within(menu)
		.getAllByRole('menuitem')
		.map((item) => item.textContent);
}

describe('HelpMenu', () => {
	it('lists the help links and, for admins, the invite entry', async () => {
		renderAppSidebar({ pinned: true });

		expect(itemLabels(await openHelpMenu())).toStrictEqual([
			'Documentation',
			'GitHub',
			'Community Slack',
			'Invite a Team Member',
		]);
	});

	it('hides the invite entry from non-admins', async () => {
		renderAppSidebar({ pinned: true, role: 'EDITOR' });

		expect(itemLabels(await openHelpMenu())).not.toContain(
			'Invite a Team Member',
		);
	});

	it('lists the first two changelog features and the full changelog', async () => {
		const toggleChangelogModal = jest.fn();
		renderAppSidebar({
			pinned: true,
			overrides: {
				changelog: changelog(['First', 'Second', 'Third']),
				toggleChangelogModal,
			},
		});

		const menu = await openHelpMenu();

		expect(within(menu).getByText("What's new")).toBeVisible();
		expect(itemLabels(menu)).toStrictEqual(
			expect.arrayContaining(['First', 'Second', 'Full Changelog']),
		);
		expect(itemLabels(menu)).not.toContain('Third');

		await userEvent
			.setup({ pointerEventsCheck: 0 })
			.click(within(menu).getByText('First'));
		expect(toggleChangelogModal).toHaveBeenCalled();
	});

	it('opens external links in a new tab and logs the click', async () => {
		const open = jest.spyOn(window, 'open').mockImplementation(() => null);
		renderAppSidebar({ pinned: true });

		const menu = await openHelpMenu();
		await userEvent
			.setup({ pointerEventsCheck: 0 })
			.click(within(menu).getByText('GitHub'));

		expect(open).toHaveBeenCalledWith(
			expect.stringContaining('github.com'),
			'_blank',
		);
		expect(logEventMock).toHaveBeenCalledWith('Help Popover: Item clicked', {
			menuRoute: 'github',
			menuLabel: 'GitHub',
		});
	});

	it('takes admins to the member invite', async () => {
		renderAppSidebar({ pinned: true });

		const menu = await openHelpMenu();
		await userEvent
			.setup({ pointerEventsCheck: 0 })
			.click(within(menu).getByText('Invite a Team Member'));

		expect(mockPush).toHaveBeenCalledWith(
			`${ROUTES.MEMBERS_SETTINGS}?invite=true`,
		);
	});
});
