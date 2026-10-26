import { safeNavigateMock } from '__tests__/safeNavigateMock';
import { fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { server } from 'mocks-server/server';
import { rest } from 'msw';
import { screen } from 'tests/test-utils';

import {
	rumSessions,
	rumViews,
} from '@/storybook/msw/__story_mockdata__/rumQueries';

import { ANDROID_APP, ok, renderPage } from '../../__tests__/renderPage';

const BASE = '*/api/v1/rum/applications/app-1';
const PATH = '/frontend/applications/app-1/sessions';

function serveSessions(
	page: Parameters<typeof rumSessions>[0] = {},
): URLSearchParams[] {
	const requests: URLSearchParams[] = [];
	server.use(
		rest.get(`${BASE}/views`, (_req, res, ctx) =>
			res(ctx.json(ok(rumViews(false)))),
		),
		rest.get(`${BASE}/sessions`, (req, res, ctx) => {
			requests.push(req.url.searchParams);
			return res(ctx.json(ok(rumSessions(page))));
		}),
	);
	return requests;
}

describe('SessionsTab', () => {
	it('lists sessions newest first with links to their timeline', async () => {
		serveSessions();
		renderPage(PATH);

		const rows = await screen.findAllByTestId('rum-sessions-row');
		expect(rows).toHaveLength(8);
		expect(screen.getByTestId('rum-sessions-total')).toHaveTextContent(
			'8 sessions',
		);
		expect(screen.getAllByTestId('rum-sessions-open')[0]).toHaveAttribute(
			'href',
			`${PATH}/7f3ac9d04b1e4a6f9e2b5c8d1a07c21e`,
		);
		expect(screen.getAllByTestId('rum-sessions-previous')[0]).toHaveTextContent(
			'3a01f2…88b0',
		);
		expect(rows[0]).toHaveTextContent('usr_9f…41ab');
		expect(rows[0]).toHaveTextContent('Chrome 130 · Windows 10');
	});

	it('names the device column and drops the browser filter on Android', async () => {
		serveSessions();
		renderPage(PATH, ANDROID_APP);

		await screen.findAllByTestId('rum-sessions-row');
		expect(
			screen.getByRole('columnheader', { name: 'Device · OS' }),
		).toBeInTheDocument();
		expect(screen.queryByTestId('rum-sessions-browser')).toBeNull();
	});

	it('sends the filters and page from the URL', async () => {
		const requests = serveSessions({ total: 120 });
		renderPage(
			`${PATH}?release=1.8.0&browser=Chrome&hasError=true&minDuration=60000&page=2&pageSize=20`,
		);

		await screen.findAllByTestId('rum-sessions-row');
		const params = requests.at(-1);
		expect(params?.get('release')).toBe('1.8.0');
		expect(params?.get('browser')).toBe('Chrome');
		expect(params?.get('hasError')).toBe('true');
		expect(params?.get('minDurationMs')).toBe('60000');
		expect(params?.get('limit')).toBe('20');
		expect(params?.get('offset')).toBe('20');
		expect(screen.getByTestId('rum-sessions-browser')).toHaveValue('Chrome');
		expect(screen.getByTestId('rum-sessions-duration')).toHaveValue('gte1m');
		expect(screen.getByTestId('rum-sessions-has-error')).toBeChecked();
	});

	it('writes a changed filter to the URL and goes back to the first page', async () => {
		const user = userEvent.setup({ pointerEventsCheck: 0 });
		serveSessions();
		renderPage(`${PATH}?page=3`);

		await user.selectOptions(
			await screen.findByTestId('rum-sessions-browser'),
			'Safari',
		);
		expect(safeNavigateMock).toHaveBeenLastCalledWith(`${PATH}?browser=Safari`);

		await user.click(screen.getByTestId('rum-sessions-has-error'));
		expect(safeNavigateMock).toHaveBeenLastCalledWith(`${PATH}?hasError=true`);

		const userIdInput = screen.getByTestId('rum-sessions-user');
		await user.type(userIdInput, 'usr_1');
		fireEvent.submit(userIdInput);
		expect(safeNavigateMock).toHaveBeenLastCalledWith(`${PATH}?userId=usr_1`);
	});

	it('pages through the list', async () => {
		const user = userEvent.setup({ pointerEventsCheck: 0 });
		serveSessions({ total: 120 });
		renderPage(PATH);

		await screen.findAllByTestId('rum-sessions-row');
		await user.click(screen.getByRole('button', { name: '2' }));

		expect(safeNavigateMock).toHaveBeenLastCalledWith(`${PATH}?page=2`);
	});

	it('says when nothing matches', async () => {
		serveSessions({ empty: true });
		renderPage(`${PATH}?hasError=true`);

		await expect(
			screen.findByTestId('rum-sessions-empty'),
		).resolves.toBeInTheDocument();
	});
});
