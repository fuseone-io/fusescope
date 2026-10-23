import { server } from 'mocks-server/server';
import { onboardingHandlers } from 'pages/GetStarted/__tests__/onboardingHandlers';
import { render, screen, waitFor } from 'tests/test-utils';

import HomeOnboarding from '../HomeOnboarding';
import ListeningIndicator from '../ListeningIndicator';

describe('HomeOnboarding', () => {
	beforeEach(() => {
		server.use(...onboardingHandlers());
	});

	it('offers three ways to start', () => {
		render(<HomeOnboarding />);

		expect(screen.getByTestId('home-path-app')).toBeInTheDocument();
		expect(screen.getByTestId('home-path-kubernetes')).toHaveAttribute(
			'href',
			'https://fuseone-io.github.io/fusescope-docs/sending-data/kubernetes/',
		);
		expect(screen.getByTestId('home-path-host')).toHaveAttribute(
			'href',
			'https://fuseone-io.github.io/fusescope-docs/sending-data/collector-vm/',
		);
	});

	it.each([
		['Java', '/get-started/java'],
		['Node.js', '/get-started/nodejs'],
		['Python', '/get-started/python'],
		['.NET', '/get-started/dotnet'],
		['Go', '/get-started/go'],
		['More', '/get-started?goal=apps'],
	])('links %s to %s', (name, href) => {
		render(<HomeOnboarding />);

		expect(screen.getByRole('link', { name })).toHaveAttribute('href', href);
	});

	it('shows the endpoints and links to the whole catalog', async () => {
		render(<HomeOnboarding />);

		await waitFor(() =>
			expect(screen.getByTestId('ingestion-endpoint-http')).toHaveTextContent(
				'https://otlp.example.com',
			),
		);
		expect(screen.getByTestId('home-browse-sources')).toHaveAttribute(
			'href',
			'/get-started',
		);
		expect(screen.getByTestId('home-otel-snippets')).toHaveAttribute(
			'href',
			'/get-started?goal=otel',
		);
	});
});

describe('ListeningIndicator', () => {
	it('names the OTLP ports from the ingestion endpoints', async () => {
		server.use(...onboardingHandlers());
		render(<ListeningIndicator />);

		await waitFor(() =>
			expect(screen.getByTestId('home-listening')).toHaveTextContent(
				'Listening for OTLP on :4317 and :443',
			),
		);
	});
});
