import { logEventMock } from '__tests__/logEventMock';
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
			'Report an issue',
			'Invite a Team Member',
			'Full Changelog',
		]);
	});

	it('hides the invite entry from non-admins', async () => {
		renderAppSidebar({ pinned: true, role: 'EDITOR' });

		expect(itemLabels(await openHelpMenu())).not.toContain(
			'Invite a Team Member',
		);
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

	it.each([
		['Documentation', 'https://docs.fusescope.fuseone.io'],
		['GitHub', 'https://github.com/fuseone-io/fusescope'],
		[
			'Report an issue',
			'https://github.com/fuseone-io/fusescope/issues/new/choose',
		],
	])('points %s to FuseScope', async (label, url) => {
		const open = jest.spyOn(window, 'open').mockImplementation(() => null);
		renderAppSidebar({ pinned: true });

		const menu = await openHelpMenu();
		await userEvent
			.setup({ pointerEventsCheck: 0 })
			.click(within(menu).getByText(label));

		expect(open).toHaveBeenCalledWith(
			expect.stringMatching(new RegExp(`^${url}`)),
			'_blank',
		);
	});

	it('points the full changelog to the FuseScope releases', async () => {
		const open = jest.spyOn(window, 'open').mockImplementation(() => null);
		renderAppSidebar({ pinned: true });

		const menu = await openHelpMenu();
		await userEvent
			.setup({ pointerEventsCheck: 0 })
			.click(within(menu).getByText('Full Changelog'));

		expect(open).toHaveBeenCalledWith(
			'https://github.com/fuseone-io/fusescope/releases',
			'_blank',
		);
	});
});
