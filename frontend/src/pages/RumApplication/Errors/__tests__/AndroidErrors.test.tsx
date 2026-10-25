import userEvent from '@testing-library/user-event';
import { server } from 'mocks-server/server';
import { rest } from 'msw';
import { screen, within } from 'tests/test-utils';

import {
	ANDROID_CRASH,
	rumAndroidErrorGroup,
	rumAndroidErrorGroups,
} from '@/storybook/msw/__story_mockdata__/rumAndroidErrors';
import { rumSourceMaps } from '@/storybook/msw/__story_mockdata__/rumErrors';

import { ANDROID_APP, ok, renderPage } from '../../__tests__/renderPage';

const BASE = '*/api/v1/rum/applications/app-1';
const PATH = '/frontend/applications/app-1/errors';

function serve(mapped = true): void {
	server.use(
		rest.get(`${BASE}/errors/:fingerprint`, (_req, res, ctx) =>
			res(ctx.json(ok(rumAndroidErrorGroup({ mapped })))),
		),
		rest.get(`${BASE}/errors`, (_req, res, ctx) =>
			res(ctx.json(ok(rumAndroidErrorGroups({ mapped })))),
		),
		rest.get(`${BASE}/sourcemaps`, (_req, res, ctx) =>
			res(ctx.json(ok(rumSourceMaps({ empty: !mapped })))),
		),
		rest.get(`${BASE}/keys`, (_req, res, ctx) => res(ctx.json(ok([])))),
	);
}

describe('Android errors', () => {
	it('tells crashes and ANRs apart and shows their retraced top frame', async () => {
		serve();
		renderPage(PATH, ANDROID_APP);

		const rows = await screen.findAllByTestId('rum-error-group');
		expect(rows).toHaveLength(2);
		expect(within(rows[0]).getByTestId('rum-error-group-kind')).toHaveTextContent(
			'Crash',
		);
		expect(within(rows[1]).getByTestId('rum-error-group-kind')).toHaveTextContent(
			'ANR',
		);
		expect(rows[0]).toHaveTextContent('com.example.shop.Item.price · Item.kt:15');
	});

	it('marks groups whose release has no R8 mapping', async () => {
		serve(false);
		renderPage(PATH, ANDROID_APP);

		const rows = await screen.findAllByTestId('rum-error-group');
		await expect(
			within(rows[1]).findByTestId('rum-error-group-no-map'),
		).resolves.toHaveTextContent('R8 mapping missing');
	});

	it('shows the retraced JVM stack with inlined frames and the cause', async () => {
		serve();
		renderPage(`${PATH}/${ANDROID_CRASH}`, ANDROID_APP);

		await expect(
			screen.findByTestId('rum-error-type'),
		).resolves.toHaveTextContent('com.example.shop.CartException');
		expect(screen.getByTestId('rum-error-kind')).toHaveTextContent('Crash');
		expect(screen.getByTestId('rum-error-symbolicated')).toHaveTextContent(
			'Retraced · /mapping.txt',
		);
		const frames = screen.getAllByTestId('rum-error-frame');
		expect(frames.map((frame) => frame.textContent)).toStrictEqual([
			expect.stringContaining('com.example.shop.Item.priceItem.kt:15inlined'),
			expect.stringContaining('com.example.shop.Cart.subtotalCart.kt:44'),
			expect.stringContaining('com.example.shop.Cart.checkoutCart.kt:51'),
			expect.stringContaining('com.example.shop.Cart.subtotalCart.kt:44'),
		]);
		expect(screen.getByTestId('rum-error-library-frames')).toHaveTextContent(
			'Show 2 library frames',
		);
		const cause = screen.getByTestId('rum-error-cause');
		expect(cause).toHaveTextContent(
			"Caused by java.lang.NullPointerException: Attempt to invoke virtual method 'long a.d.a()' on a null object reference",
		);
		expect(cause).toHaveTextContent(
			'… 3 more frames, shared with the exception above',
		);
	});

	it('asks for the release’s R8 mapping and keeps the obfuscated trace', async () => {
		const user = userEvent.setup({ pointerEventsCheck: 0 });
		serve(false);
		renderPage(`${PATH}/${ANDROID_CRASH}`, ANDROID_APP);

		const missing = await screen.findByTestId('rum-error-missing-map');
		expect(missing).toHaveTextContent('R8 mapping missing for release 2.1.0');
		expect(
			within(missing).getByTestId('rum-error-upload-command'),
		).toHaveTextContent('/api/v1/rum/applications/app-1/mappings?release=2.1.0');
		expect(screen.getByTestId('rum-error-mode-original')).toBeDisabled();
		expect(screen.getByTestId('rum-error-mode-minified')).toHaveTextContent(
			'Obfuscated',
		);
		expect(screen.getByTestId('rum-error-minified')).toHaveTextContent(
			'at a.b.a(SourceFile:6)',
		);

		await user.click(screen.getByTestId('rum-error-open-sourcemaps'));
		await expect(
			screen.findByTestId('rum-mappings-gradle'),
		).resolves.toBeInTheDocument();
	});
});
