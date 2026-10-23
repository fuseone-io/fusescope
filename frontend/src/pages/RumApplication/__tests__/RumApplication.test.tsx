import { safeNavigateMock } from '__tests__/safeNavigateMock';
import { server } from 'mocks-server/server';
import { rest } from 'msw';
import { Route } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { alertLink } from 'lib/rum/__tests__/alertLink';
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

	it('offers the frontend alert templates for the application', async () => {
		const user = userEvent.setup({ pointerEventsCheck: 0 });
		renderPage();

		await screen.findByRole('heading', { name: 'web-shop' });
		await user.click(screen.getByTestId('rum-overview-create-alert'));

		expect(
			alertLink(await screen.findByTestId('rum-alert-lcp_p75')),
		).toStrictEqual({
			template: 'lcp_p75',
			applicationId: 'app-1',
			ruleName: 'web-shop LCP p75 above 2.5 s',
			filters: [
				"attribute.event.name = 'browser.web_vital' AND browser.web_vital.name = 'lcp' AND fusescope.rum.application.id = 'app-1'",
			],
			groupBy: [['fusescope.rum.view.route']],
		});
		expect(
			alertLink(screen.getByTestId('rum-alert-session_error_rate')),
		).toStrictEqual({
			template: 'session_error_rate',
			applicationId: 'app-1',
			ruleName: 'web-shop session error rate above 5%',
			filters: [
				"fusescope.rum.application.id = 'app-1' AND attribute.event.name = 'exception'",
				"fusescope.rum.application.id = 'app-1'",
			],
			groupBy: [[], []],
		});
		expect(
			alertLink(screen.getByTestId('rum-alert-js_error_count')),
		).toStrictEqual({
			template: 'js_error_count',
			applicationId: 'app-1',
			ruleName: 'web-shop JS errors above 10',
			filters: [
				"fusescope.rum.application.id = 'app-1' AND attribute.event.name = 'exception'",
			],
			groupBy: [[]],
		});
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
