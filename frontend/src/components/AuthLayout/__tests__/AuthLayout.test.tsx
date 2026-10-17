import { fuseScopeDocsUrl } from 'constants/docs';
import { rest, server } from 'mocks-server/server';
import { render, screen, waitFor } from 'tests/test-utils';

import AuthLayout from '../AuthLayout';

const VERSION_ENDPOINT = '*/api/v1/version';

describe('AuthLayout', () => {
	beforeEach(() => {
		server.use(
			rest.get(VERSION_ENDPOINT, (_, res, ctx) =>
				res(
					ctx.status(200),
					ctx.json({ version: 'v0.148.0', ee: 'N', setupCompleted: true }),
				),
			),
		);
	});

	afterEach(() => {
		server.resetHandlers();
	});

	it('renders the brand panel next to the form', async () => {
		render(
			<AuthLayout>
				<p>form</p>
			</AuthLayout>,
		);

		expect(screen.getByText('form')).toBeInTheDocument();
		expect(
			screen.getByRole('heading', {
				name: /traces, metrics and logs in one place/i,
			}),
		).toBeInTheDocument();
		expect(screen.getByText(/opentelemetry-native/i)).toBeInTheDocument();
		expect(screen.getByText(/fast on clickhouse/i)).toBeInTheDocument();
		expect(screen.getByText(/yours to run/i)).toBeInTheDocument();
		await expect(
			screen.findByTestId('auth-brand-version'),
		).resolves.toHaveTextContent('FuseScope v0.148.0');
	});

	it.each(['<unset>', ''])(
		'shows just FuseScope when the build has no version (%j)',
		async (version) => {
			let answered = false;
			server.use(
				rest.get(VERSION_ENDPOINT, (_, res, ctx) => {
					answered = true;
					return res(
						ctx.status(200),
						ctx.json({ version, ee: 'N', setupCompleted: true }),
					);
				}),
			);
			render(
				<AuthLayout>
					<p>form</p>
				</AuthLayout>,
			);

			await waitFor(() => expect(answered).toBe(true));
			await new Promise((resolve) => {
				setTimeout(resolve, 50);
			});
			expect(screen.getByTestId('auth-brand-footer')).toHaveTextContent(
				/^FuseScope·Documentation·GitHub$/,
			);
			expect(screen.queryByTestId('auth-brand-version')).not.toBeInTheDocument();
		},
	);

	it('links to the FuseScope docs and repository, not SigNoz', () => {
		const { container } = render(
			<AuthLayout>
				<p>form</p>
			</AuthLayout>,
		);

		const docsLinks = screen.getAllByRole('link', { name: /documentation/i });
		expect(docsLinks.length).toBeGreaterThan(0);
		docsLinks.forEach((link) => {
			expect(link).toHaveAttribute('href', fuseScopeDocsUrl());
		});
		expect(screen.getByRole('link', { name: /github/i })).toHaveAttribute(
			'href',
			'https://github.com/fuseone-io/fusescope',
		);

		container.querySelectorAll('a').forEach((link) => {
			expect(link.getAttribute('href')).not.toMatch(/signoz/i);
		});
		expect(screen.queryByText(/get help/i)).not.toBeInTheDocument();
		expect(
			screen.queryByText(/all systems operational/i),
		).not.toBeInTheDocument();
	});

	it('replaces the docs link with the given header action', () => {
		render(
			<AuthLayout headerAction={<span>Already set up?</span>}>
				<p>form</p>
			</AuthLayout>,
		);

		expect(screen.getByText('Already set up?')).toBeInTheDocument();
		expect(screen.getAllByRole('link', { name: /documentation/i })).toHaveLength(
			1,
		);
	});

	it('scopes the new UI on its root', () => {
		const { container } = render(
			<AuthLayout>
				<p>form</p>
			</AuthLayout>,
		);

		expect(container.querySelector('.fs-ui')).toBeInTheDocument();
	});
});
