import { server } from 'mocks-server/server';
import { rest } from 'msw';
import { screen, within } from 'tests/test-utils';

import { scalarResult as scalar } from 'lib/rum/__tests__/fixtures';

import { ANDROID_APP, ok, renderPage } from './renderPage';

const MOBILE = [
	'session.id',
	'user_agent.original',
	'service.version',
	'os.name',
	'os.version',
	'device.manufacturer',
	'device.model.name',
];

function serveOverview(): void {
	server.use(
		rest.post('*/api/v5/query_range', async (req, res, ctx) => {
			const body = await req.json();
			const names: string[] = body.compositeQuery.queries.map(
				(query: { spec: { name: string } }) => query.spec.name,
			);
			const results = [
				scalar('S', [], 2, [[12, 30]]),
				scalar('AS', ['start.type'], 4, [
					['cold', 2140, 8, 1, 1],
					['hot', 320, 5, 0, 0],
				]),
				scalar('SS', MOBILE, 3, [
					[
						's-android-1',
						'',
						'2.1.0',
						'Android',
						'14',
						'Google',
						'Pixel 8',
						'2026-10-21T10:00:00Z',
						'2026-10-21T10:02:00Z',
						3,
					],
				]),
			].filter((result) =>
				names.includes((result as { queryName: string }).queryName),
			);
			return res(ctx.json(ok({ type: 'scalar', data: { results } })));
		}),
	);
}

describe('Android overview', () => {
	it('shows app start p75 by start type instead of the Web Vitals', async () => {
		serveOverview();
		renderPage('/frontend/applications/app-1', ANDROID_APP);

		const cold = await screen.findByTestId('rum-app-start-cold');
		await expect(within(cold).findByText('2.14')).resolves.toBeInTheDocument();
		expect(cold).toHaveTextContent('Cold start p75');
		expect(cold).toHaveTextContent('Good');
		expect(screen.getByTestId('rum-app-start-hot')).toHaveTextContent('320');
		expect(screen.getByTestId('rum-app-start-warm')).toHaveTextContent(
			'No samples',
		);
		expect(screen.queryByTestId('rum-vital-lcp')).toBeNull();
	});

	it('labels recent sessions with the device and OS', async () => {
		serveOverview();
		renderPage('/frontend/applications/app-1', ANDROID_APP);

		const row = await screen.findByTestId('rum-session-row');
		expect(row).toHaveTextContent('Google Pixel 8 · Android 14');
		expect(
			screen.getByRole('columnheader', { name: 'Device · OS' }),
		).toBeInTheDocument();
	});
});
