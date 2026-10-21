import { GetHosts200 } from 'api/generated/services/fuseScope.schemas';
import { rest, server } from 'mocks-server/server';
import { render, screen, waitFor } from 'tests/test-utils';

import WorkspaceUrl from '../WorkspaceUrl';

const ZEUS_HOSTS_ENDPOINT = '*/api/v2/zeus/hosts';

const mockHostsResponse: GetHosts200 = {
	status: 'success',
	data: {
		name: 'accepted-starfish',
		state: 'HEALTHY',
		tier: 'PREMIUM',
		hosts: [
			{
				name: 'accepted-starfish',
				is_default: true,
				url: 'https://accepted-starfish.test.cloud',
			},
			{
				name: 'custom-host',
				is_default: false,
				url: 'https://custom-host.test.cloud',
			},
		],
	},
};

describe('WorkspaceUrl', () => {
	afterEach(() => server.resetHandlers());

	it('renders the active workspace URL with protocol stripped', async () => {
		server.use(
			rest.get(ZEUS_HOSTS_ENDPOINT, (_, res, ctx) =>
				res(ctx.status(200), ctx.json(mockHostsResponse)),
			),
		);

		render(<WorkspaceUrl />);

		await expect(
			screen.findByText(/custom-host\.test\.cloud/i),
		).resolves.toBeInTheDocument();
	});

	it('does not render workspace URL when GET /zeus/hosts fails', async () => {
		let requested = false;
		server.use(
			rest.get(ZEUS_HOSTS_ENDPOINT, (_, res, ctx) => {
				requested = true;
				return res(ctx.status(500), ctx.json({}));
			}),
		);

		render(<WorkspaceUrl />);

		await waitFor(() => expect(requested).toBe(true));
		expect(screen.queryByTestId('home-workspace-url')).not.toBeInTheDocument();
	});
});
