import ROUTES from 'constants/routes';
import history from 'lib/history';
import {
	createErrorResponse,
	handleInternalServerError,
	rest,
	server,
} from 'mocks-server/server';
import { render, screen, userEvent } from 'tests/test-utils';
import { OrgSessionContext } from 'types/api/v2/sessions/context/get';

import ForgotPassword, { ForgotPasswordRouteState } from '../index';

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

const FORGOT_PASSWORD_ENDPOINT = '*/api/v2/factor_password/forgot';
const TEST_EMAIL = 'jest.test@fusescope.dev';

const org = (id: string, name: string): OrgSessionContext => ({
	id,
	name,
	authNSupport: { password: [{ provider: 'email_password' }], callback: [] },
});

const singleOrg: ForgotPasswordRouteState = {
	email: TEST_EMAIL,
	orgs: [org('org-1', 'Test Organization')],
};

const multipleOrgs: ForgotPasswordRouteState = {
	email: TEST_EMAIL,
	orgs: [org('org-1', 'Organization One'), org('org-2', 'Organization Two')],
};

const acceptRequests = (): void => {
	server.use(
		rest.post(FORGOT_PASSWORD_ENDPOINT, (_req, res, ctx) => res(ctx.status(204))),
	);
};

/** What the backend answers when `user.password.reset.allow_self` is off. */
const rejectSelfService = (): void => {
	server.use(
		rest.post(
			FORGOT_PASSWORD_ENDPOINT,
			createErrorResponse(
				501,
				'unsupported',
				'Users are not allowed to reset their password themselves, please contact an admin to reset your password.',
			),
		),
	);
};

type User = ReturnType<typeof userEvent.setup>;

describe('ForgotPassword', () => {
	let user: User;

	beforeEach(() => {
		jest.clearAllMocks();
		user = userEvent.setup({ pointerEventsCheck: 0 });
	});

	afterEach(() => {
		server.resetHandlers();
	});

	describe('request form', () => {
		it('offers to email a reset link to the email from sign in', () => {
			render(<ForgotPassword {...singleOrg} />);

			expect(
				screen.getByRole('heading', { name: /reset your password/i }),
			).toBeInTheDocument();
			expect(
				screen.getByText(/we'll email you a link to choose a new password/i),
			).toBeInTheDocument();
			expect(screen.getByTestId('email')).toHaveValue(TEST_EMAIL);
			expect(screen.getByTestId('email')).toBeDisabled();
			expect(screen.getByTestId('forgot-password-submit')).toBeEnabled();
			expect(screen.queryByTestId('orgId')).not.toBeInTheDocument();
		});

		it('goes back to sign in', async () => {
			render(<ForgotPassword {...singleOrg} />);

			await user.click(screen.getByTestId('forgot-password-back'));

			expect(mockHistoryPush).toHaveBeenCalledWith(ROUTES.LOGIN);
		});

		it.each(['', '   '])('needs an email (%j)', (email) => {
			render(<ForgotPassword {...singleOrg} email={email} />);

			expect(screen.getByTestId('forgot-password-submit')).toBeDisabled();
		});
	});

	describe('multiple workspaces', () => {
		it('needs the workspace to reset the password in', async () => {
			render(<ForgotPassword {...multipleOrgs} />);

			const submit = screen.getByTestId('forgot-password-submit');
			expect(screen.getByTestId('orgId')).toBeInTheDocument();
			expect(submit).toBeDisabled();

			await user.click(screen.getByRole('radio', { name: /organization two/i }));

			expect(submit).toBeEnabled();
		});

		it('starts from the workspace picked at sign in', () => {
			render(<ForgotPassword {...multipleOrgs} orgId="org-2" />);

			expect(
				screen.getByRole('radio', { name: /organization two/i }),
			).toBeChecked();
			expect(screen.getByTestId('forgot-password-submit')).toBeEnabled();
		});

		it('sends the picked workspace', async () => {
			let body: Record<string, unknown> | undefined;
			server.use(
				rest.post(FORGOT_PASSWORD_ENDPOINT, async (req, res, ctx) => {
					body = await req.json();
					return res(ctx.status(204));
				}),
			);
			render(<ForgotPassword {...multipleOrgs} />);

			await user.click(screen.getByRole('radio', { name: /organization two/i }));
			await user.click(screen.getByTestId('forgot-password-submit'));

			await screen.findByRole('heading', { name: /check your email/i });
			expect(body).toMatchObject({ email: TEST_EMAIL, orgId: 'org-2' });
		});
	});

	describe('self-service reset allowed', () => {
		it('tells the user to check their email', async () => {
			acceptRequests();
			render(<ForgotPassword {...singleOrg} />);

			await user.click(screen.getByTestId('forgot-password-submit'));

			await expect(
				screen.findByRole('heading', { name: /check your email/i }),
			).resolves.toBeInTheDocument();
			expect(screen.getByText(TEST_EMAIL)).toBeInTheDocument();
			expect(screen.getByText(/a reset link is on its way/i)).toBeInTheDocument();
		});

		it('goes back to sign in from the confirmation', async () => {
			acceptRequests();
			render(<ForgotPassword {...singleOrg} />);

			await user.click(screen.getByTestId('forgot-password-submit'));
			await user.click(await screen.findByTestId('back-to-login'));

			expect(mockHistoryPush).toHaveBeenCalledWith(ROUTES.LOGIN);
		});

		it('sends the link again from the confirmation', async () => {
			let requests = 0;
			server.use(
				rest.post(FORGOT_PASSWORD_ENDPOINT, (_req, res, ctx) => {
					requests += 1;
					return res(ctx.status(204));
				}),
			);
			render(<ForgotPassword {...singleOrg} />);

			await user.click(screen.getByTestId('forgot-password-submit'));
			await user.click(
				await screen.findByRole('button', { name: /send it again/i }),
			);
			await user.click(screen.getByTestId('forgot-password-submit'));

			await screen.findByRole('heading', { name: /check your email/i });
			expect(requests).toBe(2);
		});

		it('shows Sending… and disables the button while the request is in flight', async () => {
			server.use(
				rest.post(FORGOT_PASSWORD_ENDPOINT, (_req, res, ctx) =>
					res(ctx.delay(100), ctx.status(204)),
				),
			);
			render(<ForgotPassword {...singleOrg} />);

			const submit = screen.getByTestId('forgot-password-submit');
			await user.click(submit);

			await expect(screen.findByText(/sending/i)).resolves.toBeInTheDocument();
			expect(submit).toBeDisabled();
		});
	});

	describe('self-service reset turned off', () => {
		it('tells the user to ask an admin instead of claiming an email was sent', async () => {
			rejectSelfService();
			render(<ForgotPassword {...singleOrg} />);

			await user.click(screen.getByTestId('forgot-password-submit'));

			await expect(
				screen.findByRole('heading', { name: /ask an admin/i }),
			).resolves.toBeInTheDocument();
			expect(screen.getByText(/settings → members/i)).toBeInTheDocument();
			expect(screen.queryByText(/check your email/i)).not.toBeInTheDocument();
			expect(
				screen.queryByTestId('forgot-password-submit'),
			).not.toBeInTheDocument();
			expect(screen.queryByTestId('email')).not.toBeInTheDocument();
		});

		it('goes back to sign in', async () => {
			rejectSelfService();
			render(<ForgotPassword {...singleOrg} />);

			await user.click(screen.getByTestId('forgot-password-submit'));
			await user.click(await screen.findByTestId('back-to-login'));

			expect(mockHistoryPush).toHaveBeenCalledWith(ROUTES.LOGIN);
		});
	});

	describe('errors', () => {
		it('shows the API error', async () => {
			server.use(
				rest.post(
					FORGOT_PASSWORD_ENDPOINT,
					createErrorResponse(400, 'USER_NOT_FOUND', 'User not found'),
				),
			);
			render(<ForgotPassword {...singleOrg} />);

			await user.click(screen.getByTestId('forgot-password-submit'));

			await expect(screen.findByRole('alert')).resolves.toHaveTextContent(
				/user not found/i,
			);
			expect(screen.queryByText(/check your email/i)).not.toBeInTheDocument();
		});

		it('shows a server error', async () => {
			server.use(rest.post(FORGOT_PASSWORD_ENDPOINT, handleInternalServerError));
			render(<ForgotPassword {...singleOrg} />);

			await user.click(screen.getByTestId('forgot-password-submit'));

			await expect(screen.findByRole('alert')).resolves.toHaveTextContent(
				/internal server error occurred/i,
			);
		});

		it('clears the error on a new attempt', async () => {
			let requests = 0;
			server.use(
				rest.post(FORGOT_PASSWORD_ENDPOINT, (req, res, ctx) => {
					requests += 1;
					return requests === 1
						? createErrorResponse(400, 'USER_NOT_FOUND', 'User not found')(
								req,
								res,
								ctx,
							)
						: res(ctx.status(204));
				}),
			);
			render(<ForgotPassword {...singleOrg} />);

			await user.click(screen.getByTestId('forgot-password-submit'));
			await screen.findByText(/user not found/i);
			await user.click(screen.getByTestId('forgot-password-submit'));

			await screen.findByRole('heading', { name: /check your email/i });
			expect(screen.queryByText(/user not found/i)).not.toBeInTheDocument();
		});
	});
});
