import { safeNavigateMock } from '__tests__/safeNavigateMock';
import userEvent from '@testing-library/user-event';
import { server } from 'mocks-server/server';
import { rest } from 'msw';
import { screen, within } from 'tests/test-utils';

import {
	rumView,
	rumViews,
} from '@/storybook/msw/__story_mockdata__/rumQueries';

import { ok, renderPage } from '../../__tests__/renderPage';

const VIEWS = '*/api/v1/rum/applications/app-1/views';

function serveViews(oldSdk = false): string[] {
	const detailPaths: string[] = [];
	server.use(
		rest.get(VIEWS, (_req, res, ctx) =>
			res(ctx.json(ok(rumViews(false, oldSdk)))),
		),
		rest.get(`${VIEWS}/:route`, (req, res, ctx) => {
			detailPaths.push(req.url.pathname);
			return res(
				ctx.json(ok(rumView(decodeURIComponent(String(req.params.route))))),
			);
		}),
	);
	return detailPaths;
}

const routes = (): string[] =>
	screen
		.getAllByTestId('rum-views-open')
		.map((button) => button.textContent ?? '');

describe('ViewsTab', () => {
	it('lists routes slowest LCP first, without LCP last, and re-sorts', async () => {
		const user = userEvent.setup({ pointerEventsCheck: 0 });
		serveViews();
		renderPage('/frontend/applications/app-1/views');

		await screen.findAllByTestId('rum-views-row');
		expect(routes()[0]).toBe('/product/:id');
		expect(routes().at(-1)).toBe('/checkout');
		expect(
			screen.queryByTestId('rum-views-unknown-loads'),
		).not.toBeInTheDocument();

		await user.click(screen.getByTestId('rum-views-sort-errors'));
		expect(routes()[0]).toBe('/product/:id');
		await user.click(screen.getByTestId('rum-views-sort-errors'));
		expect(routes()[0]).toBe('/account/orders');
	});

	it('explains views from SDKs before 0.2.0', async () => {
		serveViews(true);
		renderPage('/frontend/applications/app-1/views');

		await expect(
			screen.findByTestId('rum-views-unknown-loads'),
		).resolves.toHaveTextContent('SDKs before 0.2.0');
	});

	it('opens a route by URL', async () => {
		const user = userEvent.setup({ pointerEventsCheck: 0 });
		serveViews();
		renderPage('/frontend/applications/app-1/views');

		await user.click((await screen.findAllByTestId('rum-views-open'))[1]);

		expect(safeNavigateMock).toHaveBeenCalledWith(
			'/frontend/applications/app-1/views?route=%2Fsearch',
		);
	});

	it('shows the route sheet with traces, clients and sessions', async () => {
		const detailPaths = serveViews();
		renderPage('/frontend/applications/app-1/views?route=%2Fproduct%2F%3Aid');

		const sheet = await screen.findByTestId('rum-route-sheet');
		const requests = await within(sheet).findAllByTestId('rum-route-request');
		expect(detailPaths[0]).toMatch(/\/views\/%2Fproduct%2F%3Aid$/);
		expect(requests).toHaveLength(4);
		expect(within(requests[0]).getByText('catalog')).toBeInTheDocument();
		expect(
			within(requests[0]).getByTestId('rum-route-request-trace'),
		).toHaveAttribute('href', '/trace/4bf92f3577b34da6a3ce929d0e0e4736');
		expect(within(requests[3]).getByText('No trace')).toBeInTheDocument();
		expect(within(sheet).getAllByTestId('rum-route-client')).toHaveLength(8);
		expect(
			within(sheet).getAllByTestId('rum-route-session-open')[0],
		).toHaveAttribute(
			'href',
			'/frontend/applications/app-1/sessions/7f3ac9d04b1e4a6f9e2b5c8d1a07c21e',
		);
		expect(within(sheet).getByTestId('rum-route-all-sessions')).toHaveAttribute(
			'href',
			'/frontend/applications/app-1/sessions?route=%2Fproduct%2F%3Aid',
		);
		expect(within(sheet).getByTestId('rum-route-create-alert')).toBeDisabled();
	});
});
