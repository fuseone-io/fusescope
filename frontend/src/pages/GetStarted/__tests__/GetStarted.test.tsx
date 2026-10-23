import { rest, server } from 'mocks-server/server';
import { NuqsTestingAdapter } from 'nuqs/adapters/testing';
import { render, screen, userEvent, waitFor, within } from 'tests/test-utils';

import GetStarted from '../index';
import { onboardingHandlers, recordRequests } from './onboardingHandlers';

/** In-memory URL state, so one test's throttled writes cannot leak into the next. */
function renderCatalog(): void {
	render(
		<NuqsTestingAdapter>
			<GetStarted />
		</NuqsTestingAdapter>,
	);
}

describe('GetStarted catalog', () => {
	beforeEach(() => {
		server.use(...onboardingHandlers());
	});

	it('opens with the ingestion details, then every section', async () => {
		renderCatalog();

		expect(screen.getByTestId('get-started-ingestion')).toBeInTheDocument();
		['apps', 'collector', 'infra', 'logs', 'db', 'frontend', 'ai'].forEach((id) =>
			expect(screen.getByTestId(`catalog-section-${id}`)).toBeInTheDocument(),
		);
		expect(screen.getByTestId('get-started-otel')).toBeInTheDocument();
		await waitFor(() =>
			expect(screen.getByTestId('signal-status-traces')).toHaveAttribute(
				'data-received',
				'true',
			),
		);
	});

	it('links guides in-app and the rest to the docs', () => {
		renderCatalog();

		expect(screen.getByTestId('catalog-entry-nodejs')).toHaveAttribute(
			'href',
			'/get-started/nodejs',
		);
		expect(screen.getByTestId('catalog-entry-redis')).toHaveAttribute(
			'href',
			'/integrations/builtin-redis',
		);
		expect(screen.getByTestId('catalog-entry-browser')).toHaveAttribute(
			'href',
			'/frontend/applications',
		);
		const hosts = screen.getByTestId('catalog-entry-hosts');
		expect(hosts).toHaveAttribute(
			'href',
			'https://fuseone-io.github.io/fusescope-docs/sending-data/hosts/',
		);
		expect(hosts).toHaveAttribute('target', '_blank');
	});

	it('narrows the catalog as you type', async () => {
		const user = userEvent.setup();
		renderCatalog();

		await user.type(screen.getByTestId('catalog-search'), 'syslog');

		await waitFor(() =>
			expect(screen.queryByTestId('catalog-section-apps')).not.toBeInTheDocument(),
		);
		const logs = screen.getByTestId('catalog-section-logs');
		expect(within(logs).getByTestId('catalog-entry-syslog')).toBeInTheDocument();
		expect(
			within(logs).queryByTestId('catalog-entry-log-files'),
		).not.toBeInTheDocument();
		expect(screen.queryByTestId('get-started-otel')).not.toBeInTheDocument();
	});

	it('shows one goal at a time', async () => {
		const user = userEvent.setup();
		renderCatalog();

		await user.click(screen.getByTestId('catalog-filter-db'));

		await waitFor(
			() =>
				expect(
					screen.queryByTestId('catalog-section-apps'),
				).not.toBeInTheDocument(),
			{ timeout: 5000 },
		);
		expect(screen.getByTestId('catalog-section-db')).toBeInTheDocument();
		expect(screen.queryByTestId('get-started-otel')).not.toBeInTheDocument();

		await user.click(screen.getByTestId('catalog-filter-otel'));

		await waitFor(
			() =>
				expect(screen.queryByTestId('catalog-section-db')).not.toBeInTheDocument(),
			{ timeout: 5000 },
		);
		expect(screen.getByTestId('get-started-otel')).toBeInTheDocument();
	});

	it('offers to clear a search that matches nothing', async () => {
		const user = userEvent.setup();
		renderCatalog();

		await user.type(screen.getByTestId('catalog-search'), 'cobol');
		await expect(
			screen.findByTestId('catalog-no-matches'),
		).resolves.toHaveTextContent('No guide matches “cobol”');

		await user.click(screen.getByTestId('catalog-clear'));

		expect(screen.getByTestId('catalog-search')).toHaveValue('');
		expect(screen.getByTestId('catalog-section-apps')).toBeInTheDocument();
	});

	it('prefills the exporter snippets with the ingestion endpoint', async () => {
		renderCatalog();

		await waitFor(() =>
			expect(screen.getByTestId('otel-env-snippet')).toHaveTextContent(
				'OTEL_EXPORTER_OTLP_ENDPOINT=https://otlp.example.com',
			),
		);
		expect(screen.getByTestId('otel-collector-snippet')).toHaveTextContent(
			'endpoint: https://otlp.example.com',
		);
	});

	it('marks an installed integration that is sending data', async () => {
		renderCatalog();

		await waitFor(() =>
			expect(screen.getByTestId('catalog-entry-redis')).toHaveTextContent(
				'Receiving',
			),
		);
		expect(screen.getByTestId('catalog-entry-nginx')).not.toHaveTextContent(
			'Receiving',
		);
	});

	it('never asks the gateway for ingestion keys', async () => {
		const requests = recordRequests();
		server.use(
			rest.get('*/api/v2/gateway/*', (_req, res, ctx) => res(ctx.status(500))),
		);
		renderCatalog();

		await waitFor(() =>
			expect(requests()).toContain('/api/v1/onboarding/ingestion'),
		);
		await waitFor(() =>
			expect(requests()).toContain('/api/v1/onboarding/status'),
		);
		expect(requests().filter((path) => path.includes('/gateway/'))).toStrictEqual(
			[],
		);
	});
});
