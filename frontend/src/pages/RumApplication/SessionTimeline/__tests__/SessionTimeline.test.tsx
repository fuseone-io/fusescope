import userEvent from '@testing-library/user-event';
import { server } from 'mocks-server/server';
import { rest } from 'msw';
import { screen, within } from 'tests/test-utils';

import { rumSession } from '@/storybook/msw/__story_mockdata__/rumQueries';

import { ok, renderPage } from '../../__tests__/renderPage';

const SESSION = '7f3ac9d04b1e4a6f9e2b5c8d1a07c21e';
const PATH = `/frontend/applications/app-1/sessions/${SESSION}`;

function serveSession(truncated = false, status = 200): void {
	server.use(
		rest.get(
			`*/api/v1/rum/applications/app-1/sessions/:sessionId`,
			(_req, res, ctx) =>
				status === 200
					? res(ctx.json(ok(rumSession(truncated))))
					: res(
							ctx.status(status),
							ctx.json({ status: 'error', error: { message: 'no session' } }),
						),
		),
	);
}

describe('SessionTimeline', () => {
	it('opens the view with the error, linking requests to traces and errors to logs', async () => {
		serveSession();
		renderPage(PATH);

		await expect(
			screen.findByTestId('rum-session-id'),
		).resolves.toHaveTextContent(SESSION);
		expect(screen.getAllByTestId('rum-session-view')).toHaveLength(6);
		expect(screen.getAllByTestId('rum-session-segment')).toHaveLength(6);
		expect(screen.getAllByTestId('rum-session-error-mark')).toHaveLength(1);

		const cart = screen.getAllByTestId('rum-session-view')[4];
		expect(within(cart).getByTestId('rum-session-view-toggle')).toHaveAttribute(
			'aria-expanded',
			'true',
		);
		expect(within(cart).getByTestId('rum-session-waterfall')).toBeInTheDocument();
		const traces = within(cart).getAllByTestId('rum-session-event-request-link');
		expect(traces[0]).toHaveTextContent('View backend trace');
		expect(traces[0].getAttribute('href')).toMatch(/^\/trace\/4bf92f/);
		const logs = within(cart).getByTestId('rum-session-event-error-link');
		const query = new URL(
			logs.getAttribute('href') ?? '',
			'http://localhost',
		).searchParams.get('compositeQuery');
		expect(query).toContain(`session.id = '${SESSION}'`);
		expect(screen.queryByTestId('rum-session-truncated')).not.toBeInTheDocument();
	});

	it('filters events by kind and expands every view', async () => {
		const user = userEvent.setup({ pointerEventsCheck: 0 });
		serveSession();
		renderPage(PATH);

		await screen.findByTestId('rum-session-id');
		await user.click(screen.getByTestId('rum-session-expand-all'));
		await user.click(screen.getByTestId('rum-session-kind-errors'));

		const events = screen.getAllByTestId('rum-session-event');
		expect(events).toHaveLength(1);
		expect(events[0]).toHaveAttribute('data-kind', 'error');

		await user.click(screen.getByTestId('rum-session-kind-views'));
		expect(screen.queryAllByTestId('rum-session-event')).toHaveLength(0);
	});

	it('warns that a large session is cut short', async () => {
		serveSession(true);
		renderPage(PATH);

		await expect(
			screen.findByTestId('rum-session-truncated'),
		).resolves.toBeInTheDocument();
	});

	it('says when the session is not in the range', async () => {
		serveSession(false, 404);
		renderPage(PATH);

		await expect(
			screen.findByTestId('rum-session-not-found'),
		).resolves.toBeInTheDocument();
		expect(screen.getByTestId('rum-session-back')).toHaveAttribute(
			'href',
			'/frontend/applications/app-1/sessions',
		);
	});
});
