import { Route, Switch } from 'react-router-dom';
import ROUTES from 'constants/routes';
import { rest, server } from 'mocks-server/server';
import { render, screen, userEvent, waitFor } from 'tests/test-utils';

import {
	onboardingHandlers,
	receivingStatus,
	recordRequests,
	waitingStatus,
} from '../../__tests__/onboardingHandlers';
import Guide from '../index';

function renderGuide(guideId = 'nodejs'): void {
	render(
		<Switch>
			<Route exact path={ROUTES.GET_STARTED}>
				<div data-testid="catalog-route" />
			</Route>
			<Route exact path={ROUTES.GET_STARTED_GUIDE}>
				<Guide />
			</Route>
		</Switch>,
		undefined,
		{ initialRoute: `/get-started/${guideId}` },
	);
}

describe('Get started guide', () => {
	it.each([
		['nodejs', 'Instrument a Node.js app'],
		['python', 'Instrument a Python app'],
		['java', 'Instrument a Java app'],
		['dotnet', 'Instrument a .NET app'],
		['go', 'Instrument a Go app'],
	])('renders the %s guide', (id, title) => {
		server.use(...onboardingHandlers());
		renderGuide(id);

		expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(title);
		expect(screen.getByTestId('guide-install-snippet')).toBeInTheDocument();
		expect(screen.getByTestId('guide-start')).toBeInTheDocument();
	});

	it('sends an unknown guide back to the catalog', () => {
		renderGuide('cobol');

		expect(screen.getByTestId('catalog-route')).toBeInTheDocument();
	});

	it('updates the snippets as you type', async () => {
		server.use(...onboardingHandlers());
		const user = userEvent.setup();
		renderGuide();

		const service = screen.getByTestId('guide-service');
		await user.clear(service);
		await user.type(service, 'checkout-api');
		const environment = screen.getByTestId('guide-environment');
		await user.clear(environment);
		await user.type(environment, 'staging');

		const run = screen.getByTestId('guide-run-snippet-shell');
		expect(run).toHaveTextContent('export OTEL_SERVICE_NAME=checkout-api');
		expect(run).toHaveTextContent(
			'export OTEL_RESOURCE_ATTRIBUTES=deployment.environment.name=staging',
		);
	});

	it('fills in the ingestion endpoint, or a local collector', async () => {
		server.use(...onboardingHandlers());
		const user = userEvent.setup();
		renderGuide();

		await waitFor(() =>
			expect(screen.getByTestId('guide-run-snippet-shell')).toHaveTextContent(
				'OTEL_EXPORTER_OTLP_ENDPOINT=https://otlp.example.com',
			),
		);

		await user.click(screen.getByTestId('guide-route-local'));

		expect(screen.getByTestId('guide-run-snippet-shell')).toHaveTextContent(
			'OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318',
		);
	});

	it.each([
		['docker', ['guide-run-snippet-dockerfile', 'guide-run-snippet-docker-run']],
		['k8s', ['guide-run-snippet-k8s']],
	])('switches the run snippet to %s', async (runtime, testIds) => {
		server.use(...onboardingHandlers());
		const user = userEvent.setup();
		renderGuide();

		await user.click(screen.getByTestId(`guide-runtime-${runtime}`));

		testIds.forEach((testId) =>
			expect(screen.getByTestId(testId)).toBeInTheDocument(),
		);
		expect(
			screen.queryByTestId('guide-run-snippet-shell'),
		).not.toBeInTheDocument();
	});

	it('waits for data from the service once the app is started', async () => {
		const requests = recordRequests();
		const searches: URLSearchParams[] = [];
		server.use(
			rest.get('*/api/v1/onboarding/status', (req, res, ctx) => {
				searches.push(req.url.searchParams);
				return res(
					ctx.json({ status: 'success', data: waitingStatus('my-service') }),
				);
			}),
			...onboardingHandlers({ status: waitingStatus }),
		);
		const user = userEvent.setup();
		renderGuide();

		expect(requests()).not.toContain('/api/v1/onboarding/status');
		const before = Date.now();
		await user.click(screen.getByTestId('guide-start'));

		await expect(screen.findByTestId('guide-waiting')).resolves.toHaveTextContent(
			'Waiting for data from my-service',
		);
		await waitFor(() => expect(searches).toHaveLength(1));
		expect(searches[0].get('service')).toBe('my-service');
		expect(Number(searches[0].get('since'))).toBeGreaterThanOrEqual(before);
		expect(screen.getByTestId('guide-troubleshooting')).toBeInTheDocument();
	});

	it('shows what arrived and where to look next', async () => {
		server.use(...onboardingHandlers({ status: receivingStatus }));
		const user = userEvent.setup();
		renderGuide();

		await user.click(screen.getByTestId('guide-start'));

		const panel = await screen.findByTestId('guide-receiving');
		expect(panel).toHaveTextContent('Receiving data from my-service');
		expect(screen.getByTestId('guide-count-spans')).toHaveTextContent('214');
		expect(screen.getByTestId('guide-count-series')).toHaveTextContent('86');
		expect(screen.getByTestId('guide-count-logs')).toHaveTextContent('57');
		expect(screen.getByTestId('guide-count-operations')).toHaveTextContent('12');
		expect(screen.getByTestId('guide-open-service')).toHaveAttribute(
			'href',
			'/services/my-service',
		);
		expect(screen.getByTestId('guide-open-traces')).toHaveAttribute(
			'href',
			ROUTES.TRACES_EXPLORER,
		);
		expect(screen.getByTestId('guide-open-logs')).toHaveAttribute(
			'href',
			ROUTES.LOGS_EXPLORER,
		);
	});
});
