import { rest, server } from 'mocks-server/server';
import { fireEvent, render, screen, waitFor, within } from 'tests/test-utils';

import AuthDomain from '../index';
import {
	AUTH_DOMAINS_LIST_ENDPOINT,
	AUTH_DOMAINS_UPDATE_ENDPOINT,
	mockGoogleAuthDomain,
	mockManagedOidcAuthDomain,
} from './mocks';

describe('AuthDomain — domains managed by the configuration file', () => {
	beforeEach(() => {
		server.use(
			rest.get(AUTH_DOMAINS_LIST_ENDPOINT, (_, res, ctx) =>
				res(
					ctx.status(200),
					ctx.json({
						status: 'success',
						data: [mockManagedOidcAuthDomain, mockGoogleAuthDomain],
					}),
				),
			),
		);
	});

	afterEach(() => {
		server.resetHandlers();
	});

	it('marks managed domains and blocks editing them', async () => {
		const updateRequests: string[] = [];
		server.use(
			rest.put(AUTH_DOMAINS_UPDATE_ENDPOINT, (req, res, ctx) => {
				updateRequests.push(req.url.pathname);
				return res(ctx.status(204));
			}),
		);

		render(<AuthDomain />);

		const managedRow = await screen.findByTestId(
			`auth-domain-row-${mockManagedOidcAuthDomain.name}`,
		);

		expect(
			within(managedRow).getByTestId('auth-domain-managed-badge'),
		).toHaveTextContent(/managed by configuration/i);
		expect(
			within(managedRow).queryByTestId('auth-domain-delete'),
		).not.toBeInTheDocument();
		// @signozhq/ui buttons stay focusable when disabled and expose aria-disabled.
		const configure = within(managedRow).getByTestId('auth-domain-configure');
		expect(configure).toHaveAttribute('aria-disabled', 'true');
		const enforceSSO = within(managedRow).getByRole('switch');
		expect(enforceSSO).toHaveAttribute('aria-disabled', 'true');

		fireEvent.click(configure);
		fireEvent.click(enforceSSO);
		expect(screen.queryByTestId('auth-domain-form')).not.toBeInTheDocument();
		expect(updateRequests).toHaveLength(0);
	});

	it('keeps domains created in the UI editable', async () => {
		render(<AuthDomain />);

		const uiRow = await screen.findByTestId(
			`auth-domain-row-${mockGoogleAuthDomain.name}`,
		);

		await waitFor(() =>
			expect(
				within(uiRow).queryByTestId('auth-domain-managed-badge'),
			).not.toBeInTheDocument(),
		);
		expect(within(uiRow).getByTestId('auth-domain-delete')).toBeEnabled();
		expect(
			within(uiRow).getByTestId('auth-domain-configure'),
		).not.toHaveAttribute('aria-disabled', 'true');
	});
});
