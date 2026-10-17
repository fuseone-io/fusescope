import { mockMatchMedia } from 'components/ui/__tests__/mockMatchMedia';
import { rest, server } from 'mocks-server/server';
import { fireEvent, render, screen } from 'tests/test-utils';

import AppSidebarProvider from '../AppSidebarProvider';

describe('AppSidebarProvider', () => {
	it('ignores Ctrl+B on pages rendered without the sidebar', () => {
		mockMatchMedia();
		const write = jest.fn();
		server.use(
			rest.put('*/api/v1/user/preferences/:name', (_req, res, ctx) => {
				write();
				return res(ctx.status(204));
			}),
		);
		const onUpdate = jest.fn();
		render(
			<AppSidebarProvider hasSidebar={false}>
				<div data-testid="page" />
			</AppSidebarProvider>,
			undefined,
			{ appContextOverrides: { updateUserPreferenceInContext: onUpdate } },
		);

		fireEvent.keyDown(window, { key: 'b', ctrlKey: true });

		expect(screen.getByTestId('page')).toBeInTheDocument();
		expect(onUpdate).not.toHaveBeenCalled();
		expect(write).not.toHaveBeenCalled();
	});
});
