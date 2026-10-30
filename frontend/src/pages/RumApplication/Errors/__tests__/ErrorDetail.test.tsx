import { safeNavigateMock } from '__tests__/safeNavigateMock';
import userEvent from '@testing-library/user-event';
import { server } from 'mocks-server/server';
import { rest } from 'msw';
import { alertLink } from 'lib/rum/__tests__/alertLink';
import { screen, within } from 'tests/test-utils';

import {
	HTTP_ERROR,
	rumErrorGroup,
	rumErrorGroups,
	rumSourceMaps,
} from '@/storybook/msw/__story_mockdata__/rumErrors';

import { ok, renderPage } from '../../__tests__/renderPage';

const BASE = '*/api/v1/rum/applications/app-1';
const PATH = `/frontend/applications/app-1/errors/${HTTP_ERROR}`;

type GroupOptions = NonNullable<Parameters<typeof rumErrorGroup>[1]>;

function serveGroup(options: GroupOptions = {}): URLSearchParams[] {
	const requests: URLSearchParams[] = [];
	server.use(
		rest.get(`${BASE}/errors/:fingerprint`, (req, res, ctx) => {
			requests.push(req.url.searchParams);
			return res(ctx.json(ok(rumErrorGroup(HTTP_ERROR, options))));
		}),
		rest.get(`${BASE}/errors`, (_req, res, ctx) =>
			res(ctx.json(ok(rumErrorGroups()))),
		),
		rest.get(`${BASE}/sourcemaps`, (_req, res, ctx) =>
			res(ctx.json(ok(rumSourceMaps()))),
		),
		rest.get(`${BASE}/keys`, (_req, res, ctx) => res(ctx.json(ok([])))),
	);
	return requests;
}

describe('ErrorDetail', () => {
	it('shows the original stack with the app’s frames and the source of the first', async () => {
		serveGroup();
		renderPage(PATH);

		await expect(
			screen.findByTestId('rum-error-type'),
		).resolves.toHaveTextContent('HttpError');
		expect(screen.getByTestId('rum-error-symbolicated')).toHaveTextContent(
			'/assets/cart.9b1e07.js.map',
		);
		const frames = screen.getAllByTestId('rum-error-frame');
		expect(frames).toHaveLength(3);
		expect(frames[0]).toHaveTextContent('updateQuantity');
		expect(frames[0]).toHaveTextContent('src/features/cart/api.ts:57:11');
		expect(
			within(frames[0]).getByTestId('rum-error-frame-context'),
		).toHaveTextContent("throw new HttpError('POST /api/cart', res.status);");
		expect(screen.getByTestId('rum-error-library-frames')).toHaveTextContent(
			'Show 3 frames from node_modules/@tanstack/query-core',
		);
		expect(screen.queryByTestId('rum-error-missing-map')).toBeNull();
	});

	it('switches to the minified stack and shows library frames on request', async () => {
		const user = userEvent.setup({ pointerEventsCheck: 0 });
		serveGroup();
		renderPage(PATH);

		await user.click(await screen.findByText(/Show 3 frames/));
		expect(screen.getAllByTestId('rum-error-library-frame')).toHaveLength(3);
		await user.click(screen.getByTestId('rum-error-mode-minified'));
		expect(screen.getByTestId('rum-error-minified')).toHaveTextContent(
			'at ar (https://shop.example.com/assets/cart.9b1e07.js:1:3381)',
		);
		expect(screen.queryByTestId('rum-error-frame')).toBeNull();
	});

	it('gives the upload command when the release has no source maps', async () => {
		const user = userEvent.setup({ pointerEventsCheck: 0 });
		serveGroup({ mapped: false });
		renderPage(PATH);

		const missing = await screen.findByTestId('rum-error-missing-map');
		expect(missing).toHaveTextContent('Source map missing for release 1.8.0');
		const command = within(missing).getByTestId('rum-error-upload-command');
		expect(command).toHaveTextContent('FUSESCOPE_APP=app-1');
		expect(command).toHaveTextContent(
			'npx @fusescope/cli@next sourcemaps upload dist --release 1.8.0',
		);
		expect(screen.getByTestId('rum-error-mode-original')).toBeDisabled();
		expect(screen.getByTestId('rum-error-minified')).toBeInTheDocument();

		await user.click(screen.getByTestId('rum-error-open-sourcemaps'));
		await expect(
			screen.findByTestId('rum-app-sourcemaps'),
		).resolves.toBeInTheDocument();
	});

	it('shows both stacks as original when both are symbolicated', async () => {
		serveGroup({ componentStack: true });
		renderPage(PATH);

		const section = await screen.findByTestId('rum-error-component-stack');
		expect(within(section).getByText('Component stack')).toBeInTheDocument();
		expect(screen.getByTestId('rum-error-mode-original')).toHaveAttribute(
			'aria-pressed',
			'true',
		);
		expect(screen.getByTestId('rum-error-symbolicated')).toBeInTheDocument();
		expect(
			within(section).getByTestId('rum-error-component-symbolicated'),
		).toHaveTextContent('/assets/cart.9b1e07.js.map');
		const frames = within(section).getAllByTestId('rum-error-frame');
		expect(frames).toHaveLength(3);
		expect(frames[0]).toHaveTextContent('CartLine');
		expect(frames[0]).toHaveTextContent('src/features/cart/CartLine.tsx:18:3');
		expect(frames[1]).toHaveTextContent('Suspense');
		expect(frames[2]).toHaveTextContent('src/features/cart/CartList.tsx:9:3');
		expect(
			within(section).getByTestId('rum-error-library-frames'),
		).toHaveTextContent('Show 2 library frames');
		expect(within(section).queryByTestId('rum-error-missing-map')).toBeNull();
	});

	it('enables Original when only the component stack is symbolicated, keeping the stack trace minified', async () => {
		serveGroup({ componentStack: true, exceptionMapped: false });
		renderPage(PATH);

		const section = await screen.findByTestId('rum-error-component-stack');
		const original = screen.getByTestId('rum-error-mode-original');
		expect(original).toBeEnabled();
		expect(original).toHaveAttribute('aria-pressed', 'true');
		expect(screen.getByTestId('rum-error-minified')).toBeInTheDocument();
		expect(screen.queryByTestId('rum-error-symbolicated')).toBeNull();
		expect(screen.getByTestId('rum-error-unmatched')).toHaveTextContent(
			'no uploaded map matches these files',
		);
		expect(
			within(section).getByTestId('rum-error-component-symbolicated'),
		).toBeInTheDocument();
		expect(
			within(section).getAllByTestId('rum-error-frame')[0],
		).toHaveTextContent('src/features/cart/CartLine.tsx:18:3');
	});

	it('keeps the component stack minified with its own status when only the stack trace is symbolicated', async () => {
		serveGroup({ componentStack: true, componentMapped: false });
		renderPage(PATH);

		const section = await screen.findByTestId('rum-error-component-stack');
		expect(screen.getByTestId('rum-error-mode-original')).toHaveAttribute(
			'aria-pressed',
			'true',
		);
		expect(screen.getByTestId('rum-error-symbolicated')).toBeInTheDocument();
		expect(
			within(section).queryByTestId('rum-error-component-symbolicated'),
		).toBeNull();
		expect(
			within(section).getByTestId('rum-error-component-unmatched'),
		).toHaveTextContent('Minified · no uploaded map matches these files');
		expect(
			within(section).getAllByTestId('rum-error-frame')[0],
		).toHaveTextContent('https://shop.example.com/assets/cart.9b1e07.js:1:4020');
	});

	it('shows the component stack’s raw locations and the stack trace’s notice without source maps', async () => {
		serveGroup({ mapped: false, componentStack: true });
		renderPage(PATH);

		const section = await screen.findByTestId('rum-error-component-stack');
		expect(screen.getByTestId('rum-error-mode-original')).toBeDisabled();
		expect(screen.getAllByTestId('rum-error-missing-map')).toHaveLength(1);
		const frames = within(section).getAllByTestId('rum-error-frame');
		expect(frames[0]).toHaveTextContent(
			'https://shop.example.com/assets/cart.9b1e07.js:1:4020',
		);
		expect(
			within(section).getByTestId('rum-error-component-missing'),
		).toHaveTextContent('no source map for 1.8.0');
	});

	it('says when the server cut the stacks short', async () => {
		serveGroup({ componentStack: true, truncated: true });
		renderPage(PATH);

		const section = await screen.findByTestId('rum-error-component-stack');
		expect(screen.getByTestId('rum-error-stack-truncated')).toHaveTextContent(
			'More frames not shown',
		);
		expect(
			within(section).getByTestId('rum-error-component-truncated'),
		).toHaveTextContent('More frames not shown');
	});

	it('has no component stack section when the event carries none', async () => {
		serveGroup();
		renderPage(PATH);

		await screen.findByTestId('rum-error-stack');
		expect(screen.queryByTestId('rum-error-component-stack')).toBeNull();
	});

	it('ends the breadcrumbs with the error and links its request and sessions', async () => {
		serveGroup();
		renderPage(`${PATH}?release=1.8.0`);

		const crumbs = await screen.findAllByTestId('rum-error-breadcrumb');
		expect(crumbs).toHaveLength(8);
		expect(crumbs[7]).toHaveAttribute('data-kind', 'error');
		expect(crumbs[7]).toHaveTextContent('0:00.0');
		expect(crumbs[6]).toHaveTextContent('−0:00.7');
		expect(screen.getByTestId('rum-error-request-trace')).toHaveAttribute(
			'href',
			expect.stringMatching(/^\/trace\/4bf92f3577b34da6a3ce929d0e0e4a3d\?spanId=/),
		);
		expect(screen.getByTestId('rum-error-request-trace')).toHaveTextContent(
			'View backend trace',
		);
		const sessions = screen.getAllByTestId('rum-error-session-open');
		expect(sessions).toHaveLength(5);
		expect(sessions[0]).toHaveAttribute(
			'href',
			'/frontend/applications/app-1/sessions/7f3ac9d04b1e4a6f9e2b5c8d1a07c21e?release=1.8.0',
		);
		expect(screen.getByTestId('rum-error-detail-logs')).toHaveAttribute(
			'href',
			expect.stringContaining('/logs/logs-explorer'),
		);
	});

	it('creates an alert on this error', async () => {
		serveGroup();
		renderPage(PATH);

		expect(
			alertLink(await screen.findByTestId('rum-error-create-alert')),
		).toStrictEqual({
			template: 'js_error_count',
			applicationId: 'app-1',
			ruleName: 'web-shop HttpError above 10',
			filters: [
				"fusescope.rum.application.id = 'app-1' AND attribute.event.name = 'exception' AND exception.type = 'HttpError' AND exception.message = 'POST /api/cart returned 502'",
			],
			groupBy: [[]],
		});
	});

	it('steps to an older event through the URL', async () => {
		const user = userEvent.setup({ pointerEventsCheck: 0 });
		const requests = serveGroup();
		renderPage(`${PATH}?event=ev-1`);

		await expect(
			screen.findByTestId('rum-error-event-position'),
		).resolves.toHaveTextContent('Event 1 of 5 latest');
		expect(requests[0].get('eventId')).toBe('ev-1');
		expect(screen.getByTestId('rum-error-event-newer')).toBeDisabled();
		await user.click(screen.getByTestId('rum-error-event-older'));
		expect(safeNavigateMock).toHaveBeenCalledWith(`${PATH}?event=ev-2`);
	});

	it('says so when the group is not in the range', async () => {
		server.use(
			rest.get(`${BASE}/errors/:fingerprint`, (_req, res, ctx) =>
				res(
					ctx.status(404),
					ctx.json({ status: 'error', error: { message: 'no group' } }),
				),
			),
		);
		renderPage(PATH);

		await expect(
			screen.findByTestId('rum-error-not-found'),
		).resolves.toHaveTextContent(HTTP_ERROR);
	});
});
