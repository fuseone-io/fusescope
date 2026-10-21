import {
	createRolesHandler,
	createTrackingHandler,
} from 'components/InviteMembers/__tests__/testUtils';
import { server } from 'mocks-server/server';
import { render, screen, userEvent, waitFor } from 'tests/test-utils';

import InviteMembersModal from '../InviteMembersModal';

jest.mock('@signozhq/ui/sonner', () => ({
	...jest.requireActual('@signozhq/ui/sonner'),
	toast: { success: jest.fn(), warning: jest.fn() },
}));

describe('InviteMembersModal payload', () => {
	afterEach(() => server.resetHandlers());

	it('sends one createUser request per invited member', async () => {
		const user = userEvent.setup({ pointerEventsCheck: 0 });
		const { handler, calls } = createTrackingHandler();
		server.use(createRolesHandler(), handler);
		const onClose = jest.fn();

		render(<InviteMembersModal open onClose={onClose} />);

		const emails = screen.getAllByPlaceholderText('e.g. john@signoz.io');
		await user.type(emails[0], 'ana@example.com');
		await user.click(screen.getAllByText('Select roles')[0]);
		await user.click(await screen.findByTitle('Editor'));

		await user.type(emails[1], 'kofi@example.com');
		await user.click(screen.getAllByText('Select roles')[0]);
		await user.click(
			(await screen.findAllByTitle('Viewer')).at(-1) as HTMLElement,
		);

		await user.click(
			screen.getByRole('button', { name: /invite team members/i }),
		);

		await waitFor(() => expect(calls).toHaveLength(2));
		expect(calls).toStrictEqual([
			{
				email: 'ana@example.com',
				frontendBaseUrl: window.location.origin,
				userRoles: [{ id: 'role-editor' }],
			},
			{
				email: 'kofi@example.com',
				frontendBaseUrl: window.location.origin,
				userRoles: [{ id: 'role-viewer' }],
			},
		]);
		await waitFor(() => expect(onClose).toHaveBeenCalled());
	});
});
