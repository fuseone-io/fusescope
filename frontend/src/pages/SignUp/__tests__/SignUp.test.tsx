import logEvent from 'api/common/logEvent';
import afterLogin from 'AppRoutes/utils';
import ROUTES from 'constants/routes';
import { rest, server } from 'mocks-server/server';
import { render, screen, userEvent, waitFor } from 'tests/test-utils';
import { SignupResponse } from 'types/api/v1/register/post';
import { Token } from 'types/api/v2/sessions/email_password/post';

import SignUp from '../SignUp';

jest.mock('AppRoutes/utils', () => ({
	__esModule: true,
	default: jest.fn(),
}));

const mockAfterLogin = jest.mocked(afterLogin);

jest.mock('lib/history', () => ({
	__esModule: true,
	default: {
		push: jest.fn(),
		location: {
			search: '',
		},
	},
}));

const REGISTER_ENDPOINT = '*/api/v1/register';
const EMAIL_PASSWORD_ENDPOINT = '*/api/v2/sessions/email_password';
const EMAIL = 'admin@fusescope.dev';
const PASSWORD = 'Fusescope2026!';

const mockSignupResponse: SignupResponse = {
	orgId: 'test-org-id',
	createdAt: Date.now(),
	email: EMAIL,
	id: 'test-user-id',
	displayName: 'Test User',
	role: 'ADMIN',
};

const mockTokenResponse: Token = {
	accessToken: 'mock-access-token',
	refreshToken: 'mock-refresh-token',
};

type User = ReturnType<typeof userEvent.setup>;

const fields = (): {
	email: HTMLElement;
	password: HTMLElement;
	confirm: HTMLElement;
	submit: HTMLElement;
} => ({
	email: screen.getByLabelText(/work email/i),
	password: screen.getByTestId('password'),
	confirm: screen.getByTestId('confirmPassword'),
	submit: screen.getByRole('button', { name: /create account and continue/i }),
});

const fill = async (
	user: User,
	{
		email = EMAIL,
		password = PASSWORD,
	}: { email?: string; password?: string } = {},
): Promise<void> => {
	const form = fields();
	await user.type(form.email, email);
	await user.type(form.password, password);
	await user.type(form.confirm, password);
};

const requirementState = (label: RegExp): string | null | undefined =>
	screen.getByText(label).closest('li')?.getAttribute('data-state');

describe('SignUp', () => {
	let user: User;

	beforeEach(() => {
		jest.clearAllMocks();
		user = userEvent.setup({ pointerEventsCheck: 0 });
	});

	afterEach(() => {
		server.resetHandlers();
	});

	describe('initial render', () => {
		it('asks for the first admin account', () => {
			render(<SignUp />, undefined, { initialRoute: ROUTES.SIGN_UP });

			expect(
				screen.getByRole('heading', { name: /create the admin account/i }),
			).toBeInTheDocument();
			expect(screen.getByText(/gets the admin role/i)).toBeInTheDocument();
			expect(screen.getByLabelText(/work email/i)).toHaveAttribute(
				'placeholder',
				'you@company.com',
			);
			expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
			expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument();
			expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute(
				'href',
				ROUTES.LOGIN,
			);
			expect(screen.queryByText(/signoz/i)).not.toBeInTheDocument();
		});
	});

	describe('validation', () => {
		it('keeps the submit disabled until every field is filled', async () => {
			render(<SignUp />, undefined, { initialRoute: ROUTES.SIGN_UP });
			const form = fields();

			expect(form.submit).toBeDisabled();

			await user.type(form.password, PASSWORD);
			await user.type(form.confirm, PASSWORD);
			expect(form.submit).toBeDisabled();

			await user.type(form.email, EMAIL);
			expect(form.submit).toBeEnabled();

			await user.clear(form.confirm);
			expect(form.submit).toBeDisabled();
		});

		it('checks the password against the policy as it is typed', async () => {
			render(<SignUp />, undefined, { initialRoute: ROUTES.SIGN_UP });
			const { password } = fields();

			expect(requirementState(/12 characters or more/i)).toBe('unmet');

			await user.type(password, 'Fusescope2026');
			expect(requirementState(/12 characters or more/i)).toBe('met');
			expect(requirementState(/upper and lower case/i)).toBe('met');
			expect(requirementState(/a number/i)).toBe('met');
			expect(requirementState(/a symbol/i)).toBe('unmet');

			await user.type(password, '!');
			expect(requirementState(/a symbol/i)).toBe('met');
		});

		it('says when the passwords do not match, once the confirmation is left', async () => {
			render(<SignUp />, undefined, { initialRoute: ROUTES.SIGN_UP });
			const form = fields();

			await user.type(form.password, PASSWORD);
			await user.type(form.confirm, 'Fusescope2025!');
			expect(
				screen.queryByText(/the passwords don't match/i),
			).not.toBeInTheDocument();

			await user.tab();
			expect(screen.getByText(/the passwords don't match/i)).toBeInTheDocument();
			expect(form.confirm).toHaveAttribute('aria-invalid', 'true');
			expect(form.submit).toBeDisabled();

			await user.clear(form.confirm);
			await user.type(form.confirm, PASSWORD);
			await user.tab();
			expect(
				screen.queryByText(/the passwords don't match/i),
			).not.toBeInTheDocument();
		});
	});

	describe('submission', () => {
		it('creates the account and signs in', async () => {
			server.use(
				rest.post(REGISTER_ENDPOINT, (_req, res, ctx) =>
					res(
						ctx.status(200),
						ctx.json({ data: mockSignupResponse, status: 'success' }),
					),
				),
				rest.post(EMAIL_PASSWORD_ENDPOINT, (_req, res, ctx) =>
					res(
						ctx.status(200),
						ctx.json({ data: mockTokenResponse, status: 'success' }),
					),
				),
			);
			render(<SignUp />, undefined, { initialRoute: ROUTES.SIGN_UP });

			await fill(user);
			await user.click(fields().submit);

			await waitFor(() => {
				expect(mockAfterLogin).toHaveBeenCalledWith(
					'mock-access-token',
					'mock-refresh-token',
				);
			});
			expect(logEvent).toHaveBeenCalledWith('Account Created Successfully', {
				email: EMAIL,
			});
		});

		it('shows the error of the register API', async () => {
			server.use(
				rest.post(REGISTER_ENDPOINT, (_req, res, ctx) =>
					res(
						ctx.status(400),
						ctx.json({
							error: {
								code: 'invalid_password',
								message:
									'password must be at least 12 characters long, should contain at least one uppercase letter',
							},
						}),
					),
				),
			);
			render(<SignUp />, undefined, { initialRoute: ROUTES.SIGN_UP });

			await fill(user, { password: 'weak' });
			await user.click(fields().submit);

			await expect(screen.findByRole('alert')).resolves.toHaveTextContent(
				/password must be at least 12 characters long/i,
			);
			expect(mockAfterLogin).not.toHaveBeenCalled();
		});
	});
});
