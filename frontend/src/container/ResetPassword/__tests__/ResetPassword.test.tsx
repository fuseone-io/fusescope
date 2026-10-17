import ROUTES from 'constants/routes';
import history from 'lib/history';
import { rest, server } from 'mocks-server/server';
import { render, screen, userEvent, waitFor } from 'tests/test-utils';

import ResetPassword from '../index';

jest.mock('lib/history', () => ({
	__esModule: true,
	default: {
		push: jest.fn(),
		location: {
			search: '?token=reset-token-123',
		},
	},
}));

const mockSuccessNotification = jest.fn();
const mockErrorNotification = jest.fn();

interface MockNotifications {
	success: jest.MockedFunction<(...args: unknown[]) => void>;
	error: jest.MockedFunction<(...args: unknown[]) => void>;
}

jest.mock('hooks/useNotifications', () => ({
	useNotifications: (): { notifications: MockNotifications } => ({
		notifications: {
			success: mockSuccessNotification,
			error: mockErrorNotification,
		},
	}),
}));

const RESET_PASSWORD_ENDPOINT = '*/api/v2/factor_password/reset';
const ROUTE = '/password-reset?token=reset-token-123';
const PASSWORD = 'Observability!2026';

const mockHistoryPush = history.push as jest.MockedFunction<
	typeof history.push
>;

type User = ReturnType<typeof userEvent.setup>;

const fields = (): {
	password: HTMLElement;
	confirm: HTMLElement;
	submit: HTMLElement;
} => ({
	password: screen.getByTestId('password'),
	confirm: screen.getByTestId('confirmPassword'),
	submit: screen.getByTestId('reset-password-submit'),
});

const fill = async (
	user: User,
	password: string,
	confirm = password,
): Promise<void> => {
	const form = fields();
	await user.type(form.password, password);
	await user.type(form.confirm, confirm);
};

describe('ResetPassword', () => {
	let user: User;

	beforeEach(() => {
		jest.clearAllMocks();
		user = userEvent.setup({ pointerEventsCheck: 0 });
		window.history.pushState({}, '', ROUTE);
	});

	afterEach(() => {
		server.resetHandlers();
	});

	it('asks for the new password twice', () => {
		render(<ResetPassword />, undefined, { initialRoute: ROUTE });

		expect(
			screen.getByRole('heading', { name: /set a new password/i }),
		).toBeInTheDocument();
		expect(screen.getByLabelText(/^new password$/i)).toBe(fields().password);
		expect(screen.getByLabelText(/confirm new password/i)).toBe(fields().confirm);
		expect(fields().submit).toHaveTextContent(/save password/i);
		expect(screen.getByText(/12 characters or more/i)).toBeInTheDocument();
	});

	describe('validation', () => {
		it('keeps the submit disabled until both passwords match', async () => {
			render(<ResetPassword />, undefined, { initialRoute: ROUTE });
			const { submit } = fields();

			expect(submit).toBeDisabled();

			await fill(user, PASSWORD, 'Observability!2025');
			expect(submit).toBeDisabled();

			await user.clear(fields().confirm);
			await user.type(fields().confirm, PASSWORD);
			expect(submit).toBeEnabled();
		});

		it('says when the passwords do not match, once the confirmation is left', async () => {
			render(<ResetPassword />, undefined, { initialRoute: ROUTE });

			await fill(user, PASSWORD, 'Observability!2025');
			expect(
				screen.queryByText(/the passwords don't match/i),
			).not.toBeInTheDocument();

			await user.tab();
			expect(screen.getByText(/the passwords don't match/i)).toBeInTheDocument();
			expect(fields().confirm).toHaveAttribute('aria-invalid', 'true');

			await user.clear(fields().confirm);
			expect(
				screen.queryByText(/the passwords don't match/i),
			).not.toBeInTheDocument();
		});

		it('checks the new password against the policy', async () => {
			render(<ResetPassword />, undefined, { initialRoute: ROUTE });

			await user.type(fields().password, 'observability');

			expect(
				screen.getByText(/upper and lower case/i).closest('li'),
			).toHaveAttribute('data-state', 'unmet');
			expect(
				screen.getByText(/12 characters or more/i).closest('li'),
			).toHaveAttribute('data-state', 'met');
		});
	});

	describe('submission', () => {
		it('saves the password and redirects to sign in', async () => {
			let body: Record<string, unknown> | undefined;
			server.use(
				rest.post(RESET_PASSWORD_ENDPOINT, async (req, res, ctx) => {
					body = await req.json();
					return res(ctx.status(204));
				}),
			);
			render(<ResetPassword />, undefined, { initialRoute: ROUTE });

			await fill(user, PASSWORD);
			await user.click(fields().submit);

			await waitFor(() => {
				expect(mockHistoryPush).toHaveBeenCalledWith(ROUTES.LOGIN);
			});
			expect(mockSuccessNotification).toHaveBeenCalled();
			expect(body).toStrictEqual({ password: PASSWORD, token: 'reset-token-123' });
		});

		it('disables the submit while saving', async () => {
			server.use(
				rest.post(RESET_PASSWORD_ENDPOINT, (_req, res, ctx) =>
					res(ctx.delay(100), ctx.status(204)),
				),
			);
			render(<ResetPassword />, undefined, { initialRoute: ROUTE });

			await fill(user, PASSWORD);
			await user.click(fields().submit);

			await waitFor(() => expect(fields().submit).toBeDisabled());
		});

		it('shows the API error until the password is edited', async () => {
			server.use(
				rest.post(RESET_PASSWORD_ENDPOINT, (_req, res, ctx) =>
					res(
						ctx.status(400),
						ctx.json({
							error: {
								code: 'invalid_password',
								message: 'password must be at least 12 characters long',
							},
						}),
					),
				),
			);
			render(<ResetPassword />, undefined, { initialRoute: ROUTE });

			await fill(user, 'weak');
			await user.click(fields().submit);

			await expect(screen.findByRole('alert')).resolves.toHaveTextContent(
				/password must be at least 12 characters long/i,
			);

			await user.type(fields().password, 'Er1!');

			await waitFor(() => {
				expect(screen.queryByRole('alert')).not.toBeInTheDocument();
			});
		});

		it('hides the API error behind the mismatch message', async () => {
			server.use(
				rest.post(RESET_PASSWORD_ENDPOINT, (_req, res, ctx) =>
					res(
						ctx.status(400),
						ctx.json({ error: { code: 'INVALID_TOKEN', message: 'Invalid token' } }),
					),
				),
			);
			render(<ResetPassword />, undefined, { initialRoute: ROUTE });

			await fill(user, PASSWORD, 'Observability!2025');
			await user.tab();

			expect(screen.getByText(/the passwords don't match/i)).toBeInTheDocument();
			expect(screen.queryByText(/invalid token/i)).not.toBeInTheDocument();
		});
	});
});
