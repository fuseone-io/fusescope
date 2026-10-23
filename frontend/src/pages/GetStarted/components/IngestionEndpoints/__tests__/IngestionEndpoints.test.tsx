import { rest, server } from 'mocks-server/server';
import { render, screen, userEvent, waitFor } from 'tests/test-utils';

import IngestionEndpoints from '../IngestionEndpoints';

const INGESTION_URL = '*/api/v1/onboarding/ingestion';

function ingestion(
	overrides: Record<string, unknown> = {},
): Record<string, unknown> {
	return {
		status: 'success',
		data: {
			otlpHttpEndpoint: 'http://localhost:4318',
			otlpGrpcEndpoint: 'localhost:4317',
			otlpGrpcInsecure: true,
			source: 'derived',
			derived: true,
			authRequired: false,
			organizationUrl: null,
			configUrl: null,
			collector: { endpoint: 'http://localhost:4318', reachable: true },
			...overrides,
		},
	};
}

function serve(body: Record<string, unknown>): void {
	server.use(rest.get(INGESTION_URL, (_req, res, ctx) => res(ctx.json(body))));
}

describe('IngestionEndpoints', () => {
	it('shows both OTLP endpoints and that no ingestion key is needed', async () => {
		serve(ingestion());
		render(<IngestionEndpoints />);

		await waitFor(() =>
			expect(screen.getByTestId('ingestion-endpoint-http')).toHaveTextContent(
				'http://localhost:4318',
			),
		);
		expect(screen.getByTestId('ingestion-endpoint-grpc')).toHaveTextContent(
			'localhost:4317',
		);
		expect(screen.getByTestId('ingestion-auth')).toHaveTextContent(
			'Ingestion key: None required',
		);
	});

	it('marks derived endpoints', async () => {
		serve(ingestion());
		render(<IngestionEndpoints />);

		await expect(
			screen.findByTestId('ingestion-derived'),
		).resolves.toBeInTheDocument();
	});

	it('does not mark endpoints an admin set', async () => {
		serve(
			ingestion({
				source: 'organization',
				derived: false,
				organizationUrl: 'https://otlp.example.com',
				otlpHttpEndpoint: 'https://otlp.example.com',
			}),
		);
		render(<IngestionEndpoints />);

		await waitFor(() =>
			expect(screen.getByTestId('ingestion-endpoint-http')).toHaveTextContent(
				'https://otlp.example.com',
			),
		);
		expect(screen.queryByTestId('ingestion-derived')).not.toBeInTheDocument();
	});

	it.each(['EDITOR', 'VIEWER'])('gives a %s no edit button', async (role) => {
		serve(ingestion());
		render(<IngestionEndpoints />, undefined, { role });

		await screen.findByTestId('ingestion-endpoint-http');
		expect(screen.queryByTestId('ingestion-edit')).not.toBeInTheDocument();
	});

	it('lets an admin set the ingestion URL inline', async () => {
		const bodies: unknown[] = [];
		serve(ingestion());
		server.use(
			rest.put(INGESTION_URL, async (req, res, ctx) => {
				bodies.push(await req.json());
				return res(
					ctx.json(
						ingestion({
							source: 'organization',
							derived: false,
							organizationUrl: 'https://otlp.example.com',
							otlpHttpEndpoint: 'https://otlp.example.com',
						}),
					),
				);
			}),
		);
		const user = userEvent.setup();
		render(<IngestionEndpoints />, undefined, { role: 'ADMIN' });

		await user.click(await screen.findByTestId('ingestion-edit'));
		const input = screen.getByTestId('ingestion-url-input');
		await user.clear(input);
		await user.type(input, 'https://otlp.example.com');
		await user.click(screen.getByTestId('ingestion-url-save'));

		await waitFor(() =>
			expect(bodies).toStrictEqual([{ ingestionUrl: 'https://otlp.example.com' }]),
		);
		await waitFor(() =>
			expect(screen.queryByTestId('ingestion-url-input')).not.toBeInTheDocument(),
		);
	});

	it('lets an admin go back to the default endpoint', async () => {
		const bodies: unknown[] = [];
		serve(
			ingestion({
				source: 'organization',
				derived: false,
				organizationUrl: 'https://otlp.example.com',
				otlpHttpEndpoint: 'https://otlp.example.com',
			}),
		);
		server.use(
			rest.put(INGESTION_URL, async (req, res, ctx) => {
				bodies.push(await req.json());
				return res(ctx.json(ingestion()));
			}),
		);
		const user = userEvent.setup();
		render(<IngestionEndpoints />, undefined, { role: 'ADMIN' });

		await user.click(await screen.findByTestId('ingestion-edit'));
		await user.click(screen.getByTestId('ingestion-url-reset'));

		await waitFor(() => expect(bodies).toStrictEqual([{ ingestionUrl: '' }]));
	});

	it('keeps the editor open with the error when saving fails', async () => {
		serve(ingestion());
		server.use(
			rest.put(INGESTION_URL, (_req, res, ctx) =>
				res(
					ctx.status(400),
					ctx.json({
						status: 'error',
						error: {
							code: 'invalid_input',
							message: 'ingestion URL must be http or https',
						},
					}),
				),
			),
		);
		const user = userEvent.setup();
		render(<IngestionEndpoints />, undefined, { role: 'ADMIN' });

		await user.click(await screen.findByTestId('ingestion-edit'));
		await user.type(screen.getByTestId('ingestion-url-input'), 'x');
		await user.click(screen.getByTestId('ingestion-url-save'));

		await expect(
			screen.findByTestId('ingestion-url-error'),
		).resolves.toBeInTheDocument();
		expect(screen.getByTestId('ingestion-url-input')).toBeInTheDocument();
	});
});
