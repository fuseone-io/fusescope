import { fireEvent, render, screen, waitFor } from 'tests/test-utils';
import { rest, server } from 'mocks-server/server';

import CreateEdit from '../CreateEdit/CreateEdit';
import { AUTH_DOMAINS_CREATE_ENDPOINT } from './mocks';

// The real @signozhq/ui/button keeps form.validateFields() from resolving inside act();
// same workaround as CreateEdit.payload.test.tsx.
jest.mock('@signozhq/ui/button', () => ({
	...jest.requireActual('@signozhq/ui/button'),
	Button: ({
		children,
		onClick,
		loading,
		disabled,
		testId,
	}: {
		children?: React.ReactNode;
		onClick?: React.MouseEventHandler<HTMLButtonElement>;
		loading?: boolean;
		disabled?: boolean;
		testId?: string;
	}) => (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled || loading}
			data-testid={testId}
		>
			{children}
		</button>
	),
}));

function openOidcForm(): void {
	fireEvent.click(screen.getByTestId('authn-provider-configure-oidc'));
}

describe('CreateEdit — OIDC provider presets', () => {
	afterEach(() => {
		server.resetHandlers();
	});

	it.each([
		['entra', 'https://login.microsoftonline.com/<tenant-id>/v2.0'],
		['keycloak', 'https://<host>/realms/<realm>'],
		['okta', 'https://<your-org>.okta.com'],
		['auth0', 'https://<tenant>.<region>.auth0.com/'],
	])('the %s preset shows its issuer format', (preset, issuerPlaceholder) => {
		render(<CreateEdit isCreate onClose={jest.fn()} />);
		openOidcForm();

		fireEvent.click(screen.getByTestId(`oidc-preset-${preset}`));

		expect(screen.getByTestId('oidc-issuer')).toHaveAttribute(
			'placeholder',
			issuerPlaceholder,
		);
	});

	it('the Okta preset requests the groups scope and sends it on save', async () => {
		let capturedPayload: { config?: { spec?: { scopes?: string[] } } } = {};
		server.use(
			rest.post(AUTH_DOMAINS_CREATE_ENDPOINT, async (req, res, ctx) => {
				capturedPayload = await req.json();
				return res(ctx.status(201), ctx.json({ status: 'success', data: {} }));
			}),
		);

		render(<CreateEdit isCreate onClose={jest.fn()} />);
		openOidcForm();

		fireEvent.click(screen.getByTestId('oidc-preset-okta'));
		await expect(screen.findByText('groups')).resolves.toBeInTheDocument();

		fireEvent.change(screen.getByTestId('oidc-domain'), {
			target: { value: 'acme.com' },
		});
		fireEvent.change(screen.getByTestId('oidc-issuer'), {
			target: { value: 'https://acme.okta.com' },
		});
		fireEvent.change(screen.getByTestId('oidc-client-id'), {
			target: { value: 'client-id' },
		});
		fireEvent.change(screen.getByTestId('oidc-client-secret'), {
			target: { value: 'client-secret' },
		});
		fireEvent.click(screen.getByTestId('auth-domain-save'));

		await waitFor(() =>
			expect(capturedPayload.config?.spec?.scopes).toStrictEqual(['groups']),
		);
	});
});
