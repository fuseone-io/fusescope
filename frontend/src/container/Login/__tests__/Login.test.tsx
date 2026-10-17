import ROUTES from 'constants/routes';
import history from 'lib/history';
import { rest, server } from 'mocks-server/server';
import { render, screen, userEvent, waitFor, within } from 'tests/test-utils';
import { ErrorV2 } from 'types/api';
import { Info } from 'types/api/v1/version/get';
import {
	OrgSessionContext,
	SessionsContext,
} from 'types/api/v2/sessions/context/get';
import { Token } from 'types/api/v2/sessions/email_password/post';

import Login from '../index';

const VERSION_ENDPOINT = '*/api/v1/version';
const SESSIONS_CONTEXT_ENDPOINT = '*/api/v2/sessions/context';
const EMAIL_PASSWORD_ENDPOINT = '*/api/v2/sessions/email_password';
const OIDC_URL = 'https://sso.example.com/auth';
const SAML_URL = 'https://idp.example.org/saml/sso?SAMLRequest=abc';
const EMAIL = 'jest.test@fusescope.dev';

jest.mock('lib/history', () => ({
	__esModule: true,
	default: {
		push: jest.fn(),
		location: {
			search: '',
		},
	},
}));

const mockHistoryPush = history.push as jest.MockedFunction<
	typeof history.push
>;

const versionInfo = (setupCompleted: boolean): Info => ({
	setupCompleted,
	ee: 'N',
	version: 'v0.148.0',
});

const passwordOrg = (id: string, name: string): OrgSessionContext => ({
	id,
	name,
	authNSupport: { password: [{ provider: 'email_password' }], callback: [] },
});

const callbackOrg = (
	id: string,
	name: string,
	provider: string,
	url: string,
): OrgSessionContext => ({
	id,
	name,
	authNSupport: { password: [], callback: [{ provider, url }] },
});

const context = (...orgs: OrgSessionContext[]): SessionsContext => ({
	exists: true,
	orgs,
});

const orgWarning = {
	code: 'ORG_WARNING',
	message: 'Organization has limited access',
	url: 'https://example.com/warning',
	errors: [{ message: 'Contact admin for full access' }],
} as ErrorV2;

const mockToken: Token = {
	accessToken: 'mock-access-token',
	refreshToken: 'mock-refresh-token',
};

const mockSessionsContext = (data: SessionsContext): void => {
	server.use(
		rest.get(SESSIONS_CONTEXT_ENDPOINT, (_, res, ctx) =>
			res(ctx.status(200), ctx.json({ status: 'success', data })),
		),
	);
};

type User = ReturnType<typeof userEvent.setup>;

const submitEmail = async (user: User, email = EMAIL): Promise<void> => {
	const emailInput = await screen.findByTestId('email');
	await waitFor(() => expect(emailInput).toBeEnabled());
	await user.type(emailInput, email);

	const continueButton = screen.getByTestId('initiate_login');
	await waitFor(() => expect(continueButton).toBeEnabled());
	await user.click(continueButton);
};

describe('Login', () => {
	let user: User;

	beforeEach(() => {
		jest.clearAllMocks();
		localStorage.clear();
		user = userEvent.setup({ pointerEventsCheck: 0 });

		server.use(
			rest.get(VERSION_ENDPOINT, (_, res, ctx) =>
				res(ctx.status(200), ctx.json(versionInfo(true))),
			),
		);
	});

	afterEach(() => {
		server.resetHandlers();
	});

	describe('email step', () => {
		it('asks for the work email first', () => {
			render(<Login />);

			expect(
				screen.getByRole('heading', { name: /sign in to fusescope/i }),
			).toBeInTheDocument();
			expect(screen.getByTestId('email')).toHaveAttribute(
				'placeholder',
				'you@company.com',
			);
			expect(screen.getByTestId('initiate_login')).toHaveTextContent(/continue/i);
			expect(screen.queryByText(/signoz/i)).not.toBeInTheDocument();
			expect(screen.queryByTestId('password')).not.toBeInTheDocument();
		});

		it('keeps Continue disabled until the email is valid', async () => {
			render(<Login />);

			const continueButton = screen.getByTestId('initiate_login');
			const emailInput = await screen.findByTestId('email');
			await waitFor(() => expect(emailInput).toBeEnabled());
			expect(continueButton).toBeDisabled();

			await user.type(emailInput, 'not-an-email');
			expect(continueButton).toBeDisabled();

			await user.type(emailInput, '@fusescope.dev');
			expect(continueButton).toBeEnabled();
		});

		it('disables Continue while the version is loading', () => {
			server.use(
				rest.get(VERSION_ENDPOINT, (_, res, ctx) =>
					res(ctx.delay(100), ctx.status(200), ctx.json(versionInfo(true))),
				),
			);

			render(<Login />);

			expect(screen.getByTestId('initiate_login')).toBeDisabled();
		});

		it('submits the email with Enter', async () => {
			mockSessionsContext(context(passwordOrg('org-1', 'Acme')));
			render(<Login />);

			const emailInput = await screen.findByTestId('email');
			await waitFor(() => expect(emailInput).toBeEnabled());
			await user.type(emailInput, `${EMAIL}{Enter}`);

			await expect(screen.findByTestId('password')).resolves.toBeInTheDocument();
		});

		it('shows the session context error', async () => {
			server.use(
				rest.get(SESSIONS_CONTEXT_ENDPOINT, (_, res, ctx) =>
					res(
						ctx.status(500),
						ctx.json({
							error: {
								code: 'internal_server',
								message: 'couldnt fetch the sessions context',
								url: '',
							},
						}),
					),
				),
			);
			render(<Login />);

			await submitEmail(user);

			await expect(screen.findByRole('alert')).resolves.toHaveTextContent(
				'couldnt fetch the sessions context',
			);
		});
	});

	describe('setup check', () => {
		it('redirects to sign up when setup is not completed', async () => {
			server.use(
				rest.get(VERSION_ENDPOINT, (_, res, ctx) =>
					res(ctx.status(200), ctx.json(versionInfo(false))),
				),
			);

			render(<Login />);

			await waitFor(() => {
				expect(mockHistoryPush).toHaveBeenCalledWith(ROUTES.SIGN_UP);
			});
		});

		it('stays on login when setup is completed', async () => {
			render(<Login />);

			await waitFor(() => expect(screen.getByTestId('email')).toBeEnabled());
			expect(mockHistoryPush).not.toHaveBeenCalled();
		});

		it('stays on login when the version call fails', async () => {
			server.use(
				rest.get(VERSION_ENDPOINT, (_, res, ctx) =>
					res(ctx.status(500), ctx.json({ error: 'Server error' })),
				),
			);

			render(<Login />);

			await waitFor(() => expect(screen.getByTestId('email')).toBeEnabled());
			expect(mockHistoryPush).not.toHaveBeenCalled();
		});
	});

	describe('password step', () => {
		beforeEach(() => {
			mockSessionsContext(context(passwordOrg('org-1', 'Acme')));
		});

		it('moves from the email to the password of the only workspace', async () => {
			render(<Login />);

			await submitEmail(user);

			await expect(
				screen.findByRole('heading', { name: /enter your password/i }),
			).resolves.toBeInTheDocument();
			expect(screen.getByText(/signing in to the/i)).toHaveTextContent(
				'Signing in to the Acme workspace.',
			);
			expect(screen.getByTestId('login-email-chip')).toHaveTextContent(EMAIL);
			expect(screen.getByTestId('password')).toBeInTheDocument();
			expect(screen.getByTestId('password_authn_submit')).toHaveTextContent(
				/^sign in$/i,
			);
			expect(screen.queryByTestId('initiate_login')).not.toBeInTheDocument();
			expect(screen.queryByTestId('orgId')).not.toBeInTheDocument();
		});

		it('goes back to the email step with Change', async () => {
			render(<Login />);
			await submitEmail(user);

			await user.click(await screen.findByRole('button', { name: /change/i }));

			expect(screen.getByTestId('email')).toHaveValue(EMAIL);
			expect(screen.getByTestId('initiate_login')).toBeInTheDocument();
			expect(screen.queryByTestId('password')).not.toBeInTheDocument();
		});

		it('shows and hides the password', async () => {
			render(<Login />);
			await submitEmail(user);

			const passwordInput = await screen.findByTestId('password');
			expect(passwordInput).toHaveAttribute('type', 'password');

			await user.click(screen.getByRole('button', { name: /show password/i }));
			expect(passwordInput).toHaveAttribute('type', 'text');

			await user.click(screen.getByRole('button', { name: /hide password/i }));
			expect(passwordInput).toHaveAttribute('type', 'password');
		});

		it('disables Sign in until a password is typed', async () => {
			render(<Login />);
			await submitEmail(user);

			const signIn = await screen.findByTestId('password_authn_submit');
			expect(signIn).toBeDisabled();

			await user.type(screen.getByTestId('password'), 'secret');
			expect(signIn).toBeEnabled();
		});

		it('signs in with the password', async () => {
			server.use(
				rest.post(EMAIL_PASSWORD_ENDPOINT, (_, res, ctx) =>
					res(ctx.status(200), ctx.json({ status: 'success', data: mockToken })),
				),
			);
			render(<Login />);
			await submitEmail(user);

			await user.type(await screen.findByTestId('password'), 'testpassword');
			await user.click(screen.getByTestId('password_authn_submit'));

			await waitFor(() => {
				expect(localStorage.getItem('AUTH_TOKEN')).toBe('mock-access-token');
			});
		});

		it('shows the error of a wrong password', async () => {
			server.use(
				rest.post(EMAIL_PASSWORD_ENDPOINT, (_, res, ctx) =>
					res(
						ctx.status(401),
						ctx.json({
							error: {
								code: 'incorrect_password',
								message: 'invalid email or password',
								url: '',
							},
						}),
					),
				),
			);
			render(<Login />);
			await submitEmail(user);

			await user.type(await screen.findByTestId('password'), 'wrongpassword');
			await user.click(screen.getByTestId('password_authn_submit'));

			await expect(screen.findByRole('alert')).resolves.toHaveTextContent(
				'invalid email or password',
			);
			expect(localStorage.getItem('AUTH_TOKEN')).toBeNull();
		});

		it('opens forgot password with the email and workspaces', async () => {
			render(<Login />);
			await submitEmail(user);

			await user.click(
				await screen.findByRole('button', { name: /forgot password/i }),
			);

			expect(mockHistoryPush).toHaveBeenCalledWith(ROUTES.FORGOT_PASSWORD, {
				email: EMAIL,
				orgId: 'org-1',
				orgs: [passwordOrg('org-1', 'Acme')],
			});
		});

		it('offers the password of an SSO workspace with password=Y', async () => {
			mockSessionsContext(context(callbackOrg('org-1', 'Acme', 'oidc', OIDC_URL)));
			render(<Login />, undefined, { initialRoute: '/login?password=Y' });

			await submitEmail(user);

			await expect(screen.findByTestId('password')).resolves.toBeInTheDocument();
			expect(
				screen.queryByTestId('callback_authn_submit'),
			).not.toBeInTheDocument();
		});
	});

	describe('single sign-on', () => {
		const originalLocation = window.location;

		beforeEach(() => {
			Object.defineProperty(window, 'location', {
				value: { href: 'http://localhost/login' },
				writable: true,
			});
		});

		afterEach(() => {
			Object.defineProperty(window, 'location', {
				value: originalLocation,
				writable: true,
			});
		});

		it.each([
			['oidc', OIDC_URL, 'sso.example.com'],
			['saml', SAML_URL, 'idp.example.org'],
		])(
			'hands an %s workspace off to its identity provider',
			async (provider, url, host) => {
				mockSessionsContext(context(callbackOrg('org-1', 'Acme', provider, url)));
				render(<Login />);

				await submitEmail(user);

				const sso = await screen.findByTestId('callback_authn_submit');
				expect(sso).toHaveTextContent(/continue with single sign-on/i);
				expect(screen.queryByTestId('password')).not.toBeInTheDocument();
				expect(screen.getByText(host)).toBeInTheDocument();

				await user.click(sso);

				await waitFor(() => expect(window.location.href).toBe(url));
			},
		);
	});

	describe('multiple workspaces', () => {
		const orgs = context(
			passwordOrg('org-1', 'Acme Labs'),
			callbackOrg('org-2', 'Acme', 'saml', SAML_URL),
			callbackOrg('org-3', 'Globex', 'oidc', OIDC_URL),
		);

		it('lists each workspace with how it signs in', async () => {
			mockSessionsContext(orgs);
			render(<Login />);

			await submitEmail(user);

			await expect(
				screen.findByRole('heading', { name: /choose a workspace/i }),
			).resolves.toBeInTheDocument();
			const picker = screen.getByTestId('orgId');
			const labs = within(picker).getByRole('radio', { name: /acme labs/i });
			const acme = within(picker).getByRole('radio', { name: /^acme$/i });
			const globex = within(picker).getByRole('radio', { name: /globex/i });

			expect(labs).toHaveAccessibleDescription(/email and password/i);
			expect(acme).toHaveAccessibleDescription(/single sign-on · saml/i);
			expect(globex).toHaveAccessibleDescription(/single sign-on · oidc/i);
			expect(screen.queryByTestId('password')).not.toBeInTheDocument();
			expect(
				screen.queryByTestId('callback_authn_submit'),
			).not.toBeInTheDocument();
		});

		it('follows the auth method of the picked workspace', async () => {
			mockSessionsContext(orgs);
			render(<Login />);
			await submitEmail(user);

			await user.click(await screen.findByRole('radio', { name: /globex/i }));
			expect(screen.getByTestId('callback_authn_submit')).toBeInTheDocument();
			expect(screen.queryByTestId('password')).not.toBeInTheDocument();

			await user.click(screen.getByRole('radio', { name: /acme labs/i }));
			expect(screen.getByTestId('password')).toBeInTheDocument();
			expect(
				screen.queryByTestId('callback_authn_submit'),
			).not.toBeInTheDocument();
		});

		it('signs in to the picked workspace', async () => {
			let orgId: string | undefined;
			server.use(
				rest.post(EMAIL_PASSWORD_ENDPOINT, async (req, res, ctx) => {
					orgId = (await req.json()).orgId;
					return res(
						ctx.status(200),
						ctx.json({ status: 'success', data: mockToken }),
					);
				}),
			);
			mockSessionsContext(orgs);
			render(<Login />);
			await submitEmail(user);

			await user.click(await screen.findByRole('radio', { name: /acme labs/i }));
			await user.type(screen.getByTestId('password'), 'testpassword');
			await user.click(screen.getByTestId('password_authn_submit'));

			await waitFor(() => {
				expect(localStorage.getItem('AUTH_TOKEN')).toBe('mock-access-token');
			});
			expect(orgId).toBe('org-1');
		});

		it('shows the warning of the picked workspace', async () => {
			mockSessionsContext(
				context(passwordOrg('org-1', 'Org 1'), {
					...passwordOrg('org-2', 'Org 2'),
					warning: orgWarning,
				}),
			);
			render(<Login />);
			await submitEmail(user);

			await user.click(await screen.findByRole('radio', { name: /org 1/i }));
			expect(screen.queryByRole('alert')).not.toBeInTheDocument();

			await user.click(screen.getByRole('radio', { name: /org 2/i }));
			await expect(screen.findByRole('alert')).resolves.toHaveTextContent(
				/organization has limited access/i,
			);
		});
	});

	describe('callback redirects', () => {
		it('signs in with the tokens the callback brings back', async () => {
			render(<Login />, undefined, {
				initialRoute: '/login?accessToken=test-token&refreshToken=test-refresh',
			});

			await waitFor(() => {
				expect(localStorage.getItem('AUTH_TOKEN')).toBe('test-token');
				expect(localStorage.getItem('REFRESH_AUTH_TOKEN')).toBe('test-refresh');
			});
		});

		it('shows the error the callback brings back', async () => {
			render(<Login />, undefined, {
				initialRoute:
					'/login?callbackauthnerr=true&code=AUTH_ERROR&message=Authentication failed&url=https://example.com/error&errors=[{"message":"Invalid token"}]',
			});

			const alert = await screen.findByRole('alert');
			expect(alert).toHaveTextContent('Authentication failed');
			expect(alert).toHaveTextContent('Invalid token');
		});

		it('ignores malformed callback error details', async () => {
			render(<Login />, undefined, {
				initialRoute:
					'/login?callbackauthnerr=true&code=AUTH_ERROR&message=Authentication failed&errors=invalid-json',
			});

			const alert = await screen.findByRole('alert');
			expect(alert).toHaveTextContent('Authentication failed');
			expect(alert).not.toHaveTextContent('invalid-json');
		});
	});

	describe('workspace warnings', () => {
		it('shows the warning of the only workspace', async () => {
			mockSessionsContext(
				context({ ...passwordOrg('org-1', 'Acme'), warning: orgWarning }),
			);
			render(<Login />);

			await submitEmail(user);

			await expect(screen.findByRole('alert')).resolves.toHaveTextContent(
				/organization has limited access/i,
			);
		});
	});

	describe('edge cases', () => {
		it('disables Continue while the session context loads', async () => {
			server.use(
				rest.get(SESSIONS_CONTEXT_ENDPOINT, (_, res, ctx) =>
					res(
						ctx.delay(100),
						ctx.status(200),
						ctx.json({ data: context(passwordOrg('org-1', 'Acme')) }),
					),
				),
			);
			render(<Login />);

			await submitEmail(user);

			expect(screen.getByTestId('initiate_login')).toBeDisabled();
		});

		it.each([
			['no workspace', { exists: false, orgs: [] }],
			[
				'a workspace without sign-in methods',
				context({
					id: 'org-1',
					name: 'Acme',
					authNSupport: { password: [], callback: [] },
				}),
			],
		])('offers no sign-in for %s', async (_, data) => {
			mockSessionsContext(data);
			render(<Login />);

			await submitEmail(user);

			await expect(
				screen.findByText(/no sign-in method is available/i),
			).resolves.toBeInTheDocument();
			expect(
				screen.queryByTestId('password_authn_submit'),
			).not.toBeInTheDocument();
			expect(
				screen.queryByTestId('callback_authn_submit'),
			).not.toBeInTheDocument();
		});
	});
});
