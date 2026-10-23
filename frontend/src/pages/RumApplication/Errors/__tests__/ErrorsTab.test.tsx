import { safeNavigateMock } from '__tests__/safeNavigateMock';
import userEvent from '@testing-library/user-event';
import { server } from 'mocks-server/server';
import { rest } from 'msw';
import { screen, within } from 'tests/test-utils';

import {
	HTTP_ERROR,
	rumErrorGroups,
	rumSourceMaps,
	TYPE_ERROR,
} from '@/storybook/msw/__story_mockdata__/rumErrors';

import { ok, renderPage } from '../../__tests__/renderPage';

const BASE = '*/api/v1/rum/applications/app-1';
const PATH = '/frontend/applications/app-1/errors';

function serveErrors(empty = false): URLSearchParams[] {
	const requests: URLSearchParams[] = [];
	server.use(
		rest.get(`${BASE}/errors`, (req, res, ctx) => {
			requests.push(req.url.searchParams);
			return res(ctx.json(ok(rumErrorGroups(empty))));
		}),
		rest.get(`${BASE}/sourcemaps`, (_req, res, ctx) =>
			res(ctx.json(ok(rumSourceMaps({ without: '1.7.2' })))),
		),
	);
	return requests;
}

describe('ErrorsTab', () => {
	it('lists the groups with their share of sessions and links to each', async () => {
		serveErrors();
		renderPage(`${PATH}?release=1.8.0`);

		const rows = await screen.findAllByTestId('rum-error-group');
		expect(rows).toHaveLength(6);
		expect(screen.getByTestId('rum-errors-total')).toHaveTextContent(
			'6 groups · 680 events',
		);
		expect(rows[0]).toHaveTextContent('TypeError');
		expect(rows[0]).toHaveTextContent('New in 1.8.0');
		expect(rows[0]).toHaveTextContent(
			'Ue · https://shop.example.com/assets/main.4f9c2a.js:1:48213',
		);
		expect(
			within(rows[0]).getByTestId('rum-error-group-share'),
		).toHaveTextContent('0.44%');
		expect(within(rows[0]).getByTestId('rum-error-group-open')).toHaveAttribute(
			'href',
			`${PATH}/${TYPE_ERROR}?release=1.8.0`,
		);
		expect(within(rows[2]).getByText('unhandledrejection')).toBeInTheDocument();
	});

	it('marks groups whose last release has no source maps', async () => {
		serveErrors();
		renderPage(PATH);

		const rows = await screen.findAllByTestId('rum-error-group');
		await expect(
			within(rows[4]).findByTestId('rum-error-group-no-map'),
		).resolves.toBeInTheDocument();
		expect(within(rows[0]).queryByTestId('rum-error-group-no-map')).toBeNull();
	});

	it('asks for the range and release of the URL', async () => {
		const requests = serveErrors();
		renderPage(`${PATH}?release=1.8.0`);

		await screen.findAllByTestId('rum-error-group');
		expect(requests[0].get('release')).toBe('1.8.0');
		expect(requests[0].get('limit')).toBe('200');
		expect(Number(requests[0].get('start'))).toBeLessThan(
			Number(requests[0].get('end')),
		);
	});

	it.each([
		['?source=unhandledrejection', [HTTP_ERROR]],
		['?q=localStorage', ['5d02e9b7c4a31f66']],
		['?route=%2Fcart', [HTTP_ERROR, '0b7c18e2f9a4d533']],
	])('filters by %s', async (search, fingerprints) => {
		serveErrors();
		renderPage(`${PATH}${search}`);

		const rows = await screen.findAllByTestId('rum-error-group-open');
		expect(
			rows.map((row) => row.getAttribute('href')?.split('/').pop()?.split('?')[0]),
		).toStrictEqual(fingerprints);
	});

	it('keeps the search in the URL', async () => {
		const user = userEvent.setup({ pointerEventsCheck: 0 });
		serveErrors();
		renderPage(`${PATH}?release=1.8.0`);

		await user.type(
			await screen.findByTestId('rum-errors-search'),
			'price{enter}',
		);
		expect(safeNavigateMock).toHaveBeenCalledWith(
			`${PATH}?release=1.8.0&q=price`,
		);
		await user.click(screen.getByTestId('rum-errors-source-onerror'));
		expect(safeNavigateMock).toHaveBeenCalledWith(
			`${PATH}?release=1.8.0&source=onerror`,
		);
	});

	it('says when nothing matches', async () => {
		serveErrors();
		renderPage(`${PATH}?q=nothing-like-this`);

		await expect(
			screen.findByTestId('rum-errors-empty'),
		).resolves.toHaveTextContent('No error groups match these filters.');
	});

	it('says when the range has no errors', async () => {
		serveErrors(true);
		renderPage(PATH);

		await expect(
			screen.findByTestId('rum-errors-empty'),
		).resolves.toHaveTextContent('No errors in this range.');
	});
});
