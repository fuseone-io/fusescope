import { server } from 'mocks-server/server';
import { rest } from 'msw';
import { render, screen, userEvent, waitFor, within } from 'tests/test-utils';

import { rumApplication } from '@/storybook/msw/__story_mockdata__/rum';
import { rumSourceMaps } from '@/storybook/msw/__story_mockdata__/rumErrors';

import RumApplicationSheet from '../RumApplicationSheet';

// msw's XHR interceptor cannot send FormData under jsdom, so the upload call is replaced.
const mockUpload = jest.fn();
jest.mock('api/generated/services/rum', () => {
	const actual = jest.requireActual('api/generated/services/rum');
	return {
		...actual,
		useUploadRUMSourceMaps: (): { mutateAsync: jest.Mock } => ({
			mutateAsync: mockUpload,
		}),
	};
});

const APP_URL = 'http://localhost/api/v1/rum/applications/app-web-shop';
const ok = (data: unknown) => ({ status: 'success', data });

interface Calls {
	deleted: URLSearchParams[];
	deletedFiles: string[];
	updated: unknown[];
}

function serve(empty = false): Calls {
	const calls: Calls = {
		deleted: [],
		deletedFiles: [],
		updated: [],
	};
	server.use(
		rest.get(APP_URL, (_req, res, ctx) => res(ctx.json(ok(rumApplication({}))))),
		rest.get(`${APP_URL}/keys`, (_req, res, ctx) => res(ctx.json(ok([])))),
		rest.get(`${APP_URL}/sourcemaps`, (req, res, ctx) =>
			res(
				ctx.json(
					ok(
						rumSourceMaps({
							empty,
							release: req.url.searchParams.get('release') ?? undefined,
						}),
					),
				),
			),
		),
		rest.delete(`${APP_URL}/sourcemaps`, (req, res, ctx) => {
			calls.deleted.push(req.url.searchParams);
			return res(ctx.status(204));
		}),
		rest.delete(`${APP_URL}/sourcemaps/:fileId`, (req, res, ctx) => {
			calls.deletedFiles.push(String(req.params.fileId));
			return res(ctx.status(204));
		}),
		rest.put(APP_URL, async (req, res, ctx) => {
			calls.updated.push(await req.json());
			return res(ctx.json(ok(rumApplication({}))));
		}),
	);
	return calls;
}

function renderTab(role?: 'VIEWER'): void {
	render(
		<RumApplicationSheet
			target={{ mode: 'edit', applicationId: 'app-web-shop' }}
			initialTab="sourcemaps"
			onClose={jest.fn()}
		/>,
		undefined,
		role ? { role } : undefined,
	);
}

describe('SourceMapsTab', () => {
	it('lists the uploaded releases and expands one to its files', async () => {
		serve();
		const user = userEvent.setup({ pointerEventsCheck: 0 });
		renderTab();

		const releases = await screen.findAllByTestId('rum-sourcemaps-release');
		expect(releases).toHaveLength(4);
		expect(releases[0]).toHaveTextContent('1.8.0');
		expect(releases[0]).toHaveTextContent('latest');
		expect(releases[0]).toHaveTextContent('6.2 MB');
		expect(
			within(releases[3]).getByTestId('rum-sourcemaps-expiring'),
		).toHaveTextContent('Deleted in 3 days');
		expect(screen.getByTestId('rum-sourcemaps-summary')).toHaveTextContent(
			'4 releases · 24 MB',
		);

		await user.click(within(releases[0]).getByTestId('rum-sourcemaps-expand'));
		const files = await within(releases[0]).findAllByTestId(
			'rum-sourcemaps-file',
		);
		expect(files).toHaveLength(4);
		expect(files[0]).toHaveTextContent('/assets/main.4f9c2a.js.map');
		expect(files[0]).toHaveTextContent('/assets/main.4f9c2a.js');
	});

	it('deletes a release after confirming, and a single file', async () => {
		const calls = serve();
		const user = userEvent.setup({ pointerEventsCheck: 0 });
		renderTab();

		const [latest] = await screen.findAllByTestId('rum-sourcemaps-release');
		await user.click(within(latest).getByTestId('rum-sourcemaps-release-delete'));
		expect(
			within(latest).getByTestId('rum-sourcemaps-confirm'),
		).toHaveTextContent('Delete 14 files of 1.8.0?');
		await user.click(within(latest).getByTestId('rum-sourcemaps-confirm-delete'));
		await waitFor(() => expect(calls.deleted).toHaveLength(1));
		expect(calls.deleted[0].get('release')).toBe('1.8.0');

		await user.click(within(latest).getByTestId('rum-sourcemaps-expand'));
		const [file] = await within(latest).findAllByTestId(
			'rum-sourcemaps-file-delete',
		);
		await user.click(file);
		await waitFor(() =>
			expect(calls.deletedFiles).toStrictEqual(['1.8.0-file-1']),
		);
	});

	it('shows the CLI, npm and API instructions for this application', async () => {
		serve();
		const user = userEvent.setup({ pointerEventsCheck: 0 });
		renderTab();

		const cli = await screen.findByTestId('rum-sourcemaps-cli');
		expect(cli).toHaveTextContent('export FUSESCOPE_APP=app-web-shop');
		await waitFor(() =>
			expect(screen.getByTestId('rum-sourcemaps-cli')).toHaveTextContent(
				'npx @fusescope/cli sourcemaps upload dist --release 1.8.0',
			),
		);
		await user.click(screen.getByTestId('rum-sourcemaps-method-npm'));
		expect(screen.getByTestId('rum-sourcemaps-npm')).toHaveTextContent(
			'"postbuild": "fusescope sourcemaps upload dist --release $npm_package_version --delete-after"',
		);
		await user.click(screen.getByTestId('rum-sourcemaps-method-api'));
		expect(screen.getByTestId('rum-sourcemaps-api')).toHaveTextContent(
			'/api/v1/rum/applications/app-web-shop/sourcemaps?release=1.8.0',
		);
	});

	it('uploads picked maps under their URL path', async () => {
		serve(true);
		mockUpload.mockResolvedValue(
			ok({
				release: '1.8.1',
				files: [{ id: 'f1', path: '/assets/main.js.map' }],
				rejected: [],
				replaced: 0,
			}),
		);
		const user = userEvent.setup({ pointerEventsCheck: 0 });
		renderTab();

		await expect(
			screen.findByTestId('rum-sourcemaps-empty'),
		).resolves.toBeInTheDocument();
		await user.type(screen.getByTestId('rum-sourcemaps-release-input'), '1.8.1');
		await user.upload(
			screen.getByTestId('rum-sourcemaps-file-input'),
			new File(['{"version":3}'], 'main.js.map', { type: 'application/json' }),
		);

		await expect(
			screen.findByTestId('rum-sourcemaps-upload-result'),
		).resolves.toHaveTextContent('Uploaded 1 file to release 1.8.1.');
		expect(mockUpload).toHaveBeenCalledTimes(1);
		const [{ pathParams, params, data }] = mockUpload.mock.calls[0];
		expect(pathParams).toStrictEqual({ id: 'app-web-shop' });
		expect(params).toStrictEqual({ release: '1.8.1' });
		expect(data.file.name).toBe('/assets/main.js.map');
	});

	it('asks for the release before uploading', async () => {
		serve(true);
		mockUpload.mockClear();
		const user = userEvent.setup({ pointerEventsCheck: 0 });
		renderTab();

		await user.upload(
			await screen.findByTestId('rum-sourcemaps-file-input'),
			new File(['{}'], 'main.js.map'),
		);
		expect(screen.getByRole('alert')).toHaveTextContent('Enter the release');
		expect(mockUpload).not.toHaveBeenCalled();
	});

	it('saves the retention through the application', async () => {
		const calls = serve();
		const user = userEvent.setup({ pointerEventsCheck: 0 });
		renderTab();

		const save = await screen.findByTestId('rum-sourcemaps-retention-save');
		expect(save).toBeDisabled();
		await user.click(screen.getByTestId('rum-sourcemaps-retention-30d'));
		await user.click(screen.getByTestId('rum-sourcemaps-keep'));
		await user.click(save);

		await waitFor(() => expect(calls.updated).toHaveLength(1));
		expect(calls.updated[0]).toMatchObject({
			name: 'web-shop',
			environment: 'production',
			sourceMaps: { retention: '30d', keepNewestReleases: false },
		});
	});

	it('is read-only for a viewer', async () => {
		serve();
		renderTab('VIEWER');

		await expect(
			screen.findAllByTestId('rum-sourcemaps-release'),
		).resolves.toHaveLength(4);
		expect(screen.queryByTestId('rum-sourcemaps-release-delete')).toBeNull();
		expect(screen.queryByTestId('rum-sourcemaps-drop')).toBeNull();
		expect(screen.queryByTestId('rum-sourcemaps-retention-save')).toBeNull();
		expect(screen.getByTestId('rum-sourcemaps-readonly')).toBeInTheDocument();
		expect(screen.getByTestId('rum-sourcemaps-keep')).toBeDisabled();
	});
});
