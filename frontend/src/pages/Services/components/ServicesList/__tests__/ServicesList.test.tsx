import ServiceTraces from 'container/ServiceApplication/ServiceTraces';
import history from 'lib/history';
import { encode } from 'js-base64';
import { server } from 'mocks-server/server';
import { rest } from 'msw';
import {
	fireEvent,
	render,
	screen,
	userEvent,
	waitFor,
	within,
} from 'tests/test-utils';
import { ServicesList } from 'types/api/metrics/getService';

const mockSafeNavigate = jest.fn();

jest.mock('hooks/useSafeNavigate', () => ({
	useSafeNavigate: (): { safeNavigate: jest.Mock } => ({
		safeNavigate: mockSafeNavigate,
	}),
}));

const SERVICES_URL = 'http://localhost/api/v2/services';

function service(overrides: Partial<ServicesList>): ServicesList {
	return {
		serviceName: 'svc',
		p99: 1_000_000,
		avgDuration: 500_000,
		numCalls: 10,
		callRate: 1,
		numErrors: 0,
		errorRate: 0,
		...overrides,
	};
}

const SERVICES: ServicesList[] = [
	service({ serviceName: 'checkout', p99: 612_000_000, errorRate: 8.7 }),
	service({ serviceName: 'cart', p99: 64_000_000, errorRate: 1.1 }),
	service({ serviceName: 'auth', p99: 96_000_000, errorRate: 0 }),
];

function respondWith(services: ServicesList[]): jest.Mock {
	const onRequest = jest.fn();
	server.use(
		rest.post(SERVICES_URL, async (req, res, ctx) => {
			onRequest(await req.json());
			return res(ctx.status(200), ctx.json({ status: 'success', data: services }));
		}),
	);
	return onRequest;
}

function serviceNames(): string[] {
	return screen
		.getAllByTestId('service-row')
		.map((row) => within(row).getByTestId('service-name').textContent ?? '');
}

describe('Services list', () => {
	beforeEach(() => {
		mockSafeNavigate.mockClear();
		history.replace('/services');
	});

	it('renders the header with the count and one row per service', async () => {
		respondWith(SERVICES);
		render(<ServiceTraces />);

		await expect(
			screen.findByRole('heading', { level: 1, name: 'Services' }),
		).resolves.toBeInTheDocument();
		await waitFor(() =>
			expect(screen.getAllByTestId('service-row')).toHaveLength(3),
		);
		expect(screen.getByTestId('services-count')).toHaveTextContent('3');

		const checkout = screen.getAllByTestId('service-row')[0];
		expect(within(checkout).getByTestId('service-p99')).toHaveTextContent(
			'612 ms',
		);
		expect(within(checkout).getByTestId('service-error-rate')).toHaveTextContent(
			'8.7%',
		);
	});

	it('puts the most failing services first by default and sorts on header click', async () => {
		respondWith(SERVICES);
		render(<ServiceTraces />);

		await waitFor(() =>
			expect(serviceNames()).toStrictEqual(['checkout', 'cart', 'auth']),
		);

		fireEvent.click(screen.getByTestId('services-sort-p99'));
		expect(serviceNames()).toStrictEqual(['checkout', 'auth', 'cart']);
		fireEvent.click(screen.getByTestId('services-sort-p99'));
		expect(serviceNames()).toStrictEqual(['cart', 'auth', 'checkout']);

		fireEvent.click(screen.getByTestId('services-sort-errorRate'));
		expect(serviceNames()).toStrictEqual(['checkout', 'cart', 'auth']);
	});

	it('filters the rows by the service search', async () => {
		respondWith(SERVICES);
		render(<ServiceTraces />);

		await waitFor(() =>
			expect(screen.getAllByTestId('service-row')).toHaveLength(3),
		);
		await userEvent.type(screen.getByPlaceholderText('Search by service'), 'CAR');

		expect(serviceNames()).toStrictEqual(['cart']);
	});

	it('pages through more than ten services', async () => {
		respondWith(
			Array.from({ length: 12 }, (_, index) =>
				service({ serviceName: `svc-${index}`, p99: (index + 1) * 1_000_000 }),
			),
		);
		render(<ServiceTraces />);

		await waitFor(() =>
			expect(screen.getAllByTestId('service-row')).toHaveLength(10),
		);
		expect(screen.getByText('1-10 of 12 items')).toBeInTheDocument();

		fireEvent.click(screen.getByTestId('pagination-next'));
		expect(serviceNames()).toStrictEqual(['svc-1', 'svc-0']);
	});

	it('sends the selected environment from the URL with the request', async () => {
		history.replace(
			`/services?resourceAttribute=${encode(
				JSON.stringify([
					{
						id: 'env',
						tagKey: 'resource_deployment.environment',
						operator: 'IN',
						tagValue: ['production'],
					},
				]),
			)}`,
		);
		const onRequest = respondWith(SERVICES);
		render(<ServiceTraces />);

		await waitFor(() => expect(onRequest).toHaveBeenCalled());
		expect(onRequest.mock.calls[0][0].tags).toStrictEqual([
			expect.objectContaining({
				Key: 'deployment.environment',
				StringValues: ['production'],
			}),
		]);
		expect(screen.getByTestId('resource-environment-filter')).toBeInTheDocument();
	});

	it('opens the service page when a row is clicked', async () => {
		respondWith(SERVICES);
		render(<ServiceTraces />);

		const [checkout] = await screen.findAllByTestId('service-row');
		fireEvent.click(checkout);

		expect(mockSafeNavigate).toHaveBeenCalledWith(
			expect.stringMatching(/^\/services\/checkout\?/),
			{ newTab: false },
		);
	});

	it('warns about a service with too many top level operations', async () => {
		respondWith([
			service({
				serviceName: 'noisy',
				dataWarning: {
					topLevelOps: Array.from({ length: 2501 }, (_, index) => `op-${index}`),
				},
			}),
		]);
		render(<ServiceTraces />);

		fireEvent.pointerEnter(await screen.findByTestId('too-many-operations'), {
			pointerType: 'mouse',
		});

		await expect(
			screen.findByText('Too Many Top Level Operations'),
		).resolves.toBeInTheDocument();
		expect(
			screen.getByRole('link', { name: 'Show Top Level Operations' }),
		).toHaveAttribute('href', '/services/noisy/top-level-operations');
	});

	it('flags services against the previous period and lists them first', async () => {
		respondWith(SERVICES);
		const column = (index: number): Record<string, unknown> => ({
			name: `__result_${index}`,
			aggregationIndex: index,
			columnType: 'aggregation',
		});
		const totals = (queryName: string, rows: unknown[][]): unknown => ({
			queryName,
			columns: [
				{ name: 'service.name', columnType: 'group' },
				...[0, 1, 2, 3, 4].map(column),
			].map((item) => ({ ...item, queryName })),
			data: rows,
		});
		server.use(
			rest.post('http://localhost/api/v5/query_range', async (req, res, ctx) => {
				const body = await req.json();
				const results =
					body.requestType === 'scalar'
						? [
								totals('A', [['auth', 100, 0, 1e7, 2e7, 9e7]]),
								totals('B', [['auth', 100, 0, 1e7, 2e7, 3e7]]),
							]
						: [];
				return res(ctx.json({ status: 'success', data: { data: { results } } }));
			}),
		);
		render(<ServiceTraces />);

		await waitFor(() =>
			expect(screen.getByTestId('service-highlight')).toHaveTextContent('p99 ↑3×'),
		);
		expect(serviceNames()[0]).toBe('auth');
		expect(screen.getByTestId('services-flagged-count')).toHaveTextContent('1');
	});

	it('shows the empty state when no service reports', async () => {
		respondWith([]);
		render(<ServiceTraces />);

		await expect(
			screen.findByTestId('services-empty'),
		).resolves.toHaveTextContent('No services');
		expect(screen.queryByTestId('service-row')).not.toBeInTheDocument();
	});
});
