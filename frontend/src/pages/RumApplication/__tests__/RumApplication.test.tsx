import { safeNavigateMock } from '__tests__/safeNavigateMock';
import { server } from 'mocks-server/server';
import { rest } from 'msw';
import { Route } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { render, screen } from 'tests/test-utils';

import RumApplication from '../index';
import { renderPage } from './renderPage';

describe('RumApplication', () => {
	it('opens on the overview, every tab enabled', async () => {
		renderPage();

		await expect(
			screen.findByRole('heading', { name: 'web-shop' }),
		).resolves.toBeInTheDocument();
		expect(screen.getByTestId('page-tab-overview')).toHaveAttribute(
			'aria-selected',
			'true',
		);
		['views', 'errors', 'sessions'].forEach((tab) => {
			expect(screen.getByTestId(`page-tab-${tab}`)).toBeEnabled();
		});
	});

	it.each([
		['/frontend/applications/app-1/views', 'views'],
		['/frontend/applications/app-1/sessions', 'sessions'],
		['/frontend/applications/app-1/sessions/abc', 'sessions'],
		['/frontend/applications/app-1/errors', 'errors'],
		['/frontend/applications/app-1/errors/3fa8b015c0d1e2f3', 'errors'],
	])('selects the tab of %s', async (path, tab) => {
		renderPage(path);

		await expect(screen.findByTestId(`page-tab-${tab}`)).resolves.toHaveAttribute(
			'aria-selected',
			'true',
		);
	});

	it('moves between tabs by route, keeping the release', async () => {
		const user = userEvent.setup({ pointerEventsCheck: 0 });
		renderPage('/frontend/applications/app-1?release=1.8.0');

		await user.click(await screen.findByTestId('page-tab-views'));

		expect(safeNavigateMock).toHaveBeenCalledWith(
			'/frontend/applications/app-1/views?release=1.8.0',
		);
	});

	it('says so when the application cannot be loaded', async () => {
		server.use(
			rest.get('*/api/v1/rum/applications/app-1', (_req, res, ctx) =>
				res(
					ctx.status(404),
					ctx.json({ status: 'error', error: { message: 'not found' } }),
				),
			),
		);
		render(
			<Route path="/frontend/applications/:id">
				<RumApplication />
			</Route>,
			undefined,
			{ initialRoute: '/frontend/applications/app-1' },
		);

		await expect(
			screen.findByTestId('rum-application-not-found'),
		).resolves.toBeInTheDocument();
	});
});
