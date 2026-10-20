import { Route } from 'react-router-dom';
import { FeatureKeys } from 'constants/features';
import ROUTES from 'constants/routes';
import { server } from 'mocks-server/server';
import { rest } from 'msw';
import {
	defaultFeatureFlags,
	fireEvent,
	render,
	screen,
	userEvent,
	waitFor,
	within,
} from 'tests/test-utils';

import Endpoints from '../Endpoints';

const mockSafeNavigate = jest.fn();

jest.mock('hooks/useSafeNavigate', () => ({
	useSafeNavigate: (): { safeNavigate: jest.Mock } => ({
		safeNavigate: mockSafeNavigate,
	}),
}));

const OPERATIONS = [
	{
		name: 'HTTP GET /dispatch',
		p50: 6.5e8,
		p95: 9.8e8,
		p99: 1.12e9,
		numCalls: 3600,
		errorCount: 36,
	},
	{
		name: 'HTTP GET /config',
		p50: 1e6,
		p95: 2e6,
		p99: 3e6,
		numCalls: 100,
		errorCount: 0,
	},
];

function scalarRow(route: string, values: number[]): unknown[] {
	return [route, ...values];
}

function respond(): { operations: jest.Mock; queryRange: jest.Mock } {
	const operations = jest.fn();
	const queryRange = jest.fn();
	server.use(
		rest.post(
			'http://localhost/api/v2/service/top_operations',
			async (req, res, ctx) => {
				operations('top_operations', await req.json());
				return res(ctx.json({ status: 'success', data: OPERATIONS }));
			},
		),
		rest.post(
			'http://localhost/api/v2/service/entry_point_operations',
			async (req, res, ctx) => {
				operations('entry_point_operations', await req.json());
				return res(ctx.json({ status: 'success', data: OPERATIONS.slice(0, 1) }));
			},
		),
		rest.post('http://localhost/api/v5/query_range', async (req, res, ctx) => {
			const body = await req.json();
			queryRange(body);
			if (body.requestType !== 'scalar') {
				return res(
					ctx.json({ status: 'success', data: { data: { results: [] } } }),
				);
			}
			return res(
				ctx.json({
					status: 'success',
					data: {
						data: {
							results: [
								{
									queryName: 'A',
									columns: [
										{ name: 'http.route', queryName: 'A', columnType: 'group' },
										...[0, 1, 2, 3, 4, 5].map((index) => ({
											name: `__result_${index}`,
											queryName: 'A',
											aggregationIndex: index,
											columnType: 'aggregation',
										})),
									],
									data: [
										scalarRow('/dispatch', [3600, 36, 6.5e8, 9.8e8, 1.12e9, 3600 * 7e8]),
										scalarRow('', [200, 0, 1e6, 2e6, 3e6, 200 * 1e6]),
									],
								},
							],
						},
					},
				}),
			);
		}),
	);
	return { operations, queryRange };
}

function renderTab(): void {
	render(
		<Route path={ROUTES.SERVICE_METRICS}>
			<Endpoints servicename="frontend" />
		</Route>,
		undefined,
		{ initialRoute: '/services/frontend' },
	);
}

const names = (): string[] =>
	screen
		.getAllByTestId('top-operation-row')
		.map((row) => within(row).getByRole('button').textContent ?? '');

describe('Endpoints tab', () => {
	beforeEach(() => mockSafeNavigate.mockClear());

	it('lists the top operations with rate, latency and error rate', async () => {
		const { operations } = respond();
		renderTab();

		await waitFor(() => expect(names()).toHaveLength(2));
		expect(operations).toHaveBeenCalledWith(
			'top_operations',
			expect.objectContaining({ service: 'frontend', limit: 5000 }),
		);
		const dispatch = screen.getAllByTestId('top-operation-row')[0];
		expect(dispatch).toHaveTextContent('HTTP GET /dispatch');
		expect(dispatch).toHaveTextContent('1.12 s');
		expect(dispatch).toHaveTextContent('1.0%');
	});

	it('reads entry-point operations when the switch is on', async () => {
		const { operations } = respond();
		renderTab();
		await waitFor(() => expect(names()).toHaveLength(2));

		fireEvent.click(screen.getByTestId('endpoints-entry-points'));

		await waitFor(() => expect(names()).toHaveLength(1));
		expect(operations).toHaveBeenCalledWith(
			'entry_point_operations',
			expect.objectContaining({ service: 'frontend' }),
		);
	});

	it('filters rows by the search', async () => {
		respond();
		renderTab();
		await waitFor(() => expect(names()).toHaveLength(2));

		await userEvent.type(screen.getByTestId('top-operations-search'), 'config');

		expect(names()).toStrictEqual(['HTTP GET /config']);
	});

	it('groups by http.route, with spans lacking it as "(not set)"', async () => {
		const { queryRange } = respond();
		renderTab();
		await waitFor(() => expect(names()).toHaveLength(2));

		fireEvent.click(screen.getByTestId('endpoints-group-http.route'));

		await waitFor(() => expect(names()).toContain('(not set)'));
		expect(
			queryRange.mock.calls.some(
				([body]) =>
					body.compositeQuery.queries[0].spec.groupBy[0].name === 'http.route',
			),
		).toBe(true);
		const notSet = screen
			.getAllByTestId('top-operation-row')
			.find((row) => row.textContent?.includes('(not set)'));
		expect(notSet).toHaveTextContent('—');
	});

	it('opens the traces of an operation from its row', async () => {
		respond();
		renderTab();
		await waitFor(() => expect(names()).toHaveLength(2));

		fireEvent.click(screen.getAllByTestId('top-operation-row')[0]);

		const [url] = mockSafeNavigate.mock.calls[0];
		expect(url).toMatch(/^\/traces-explorer\?/);
		expect(url).toContain('"operation":["HTTP GET /dispatch"]');
		expect(url).toContain('HTTP%20GET%20%2Fdispatch');
	});

	it('lists span-metrics operations when use_span_metrics is on', async () => {
		const metric = (queryName: string, value: number): unknown => ({
			queryName,
			columns: [
				{ name: 'operation', queryName, columnType: 'group' },
				{
					name: '__result_0',
					queryName,
					aggregationIndex: 0,
					columnType: 'aggregation',
				},
			],
			data: [['HTTP GET', value]],
		});
		server.use(
			rest.post('http://localhost/api/v5/query_range', async (req, res, ctx) => {
				const body = await req.json();
				const results =
					body.requestType === 'scalar'
						? [
								metric('A', 7200),
								metric('B', 72),
								metric('C', 50),
								metric('D', 90),
								metric('E', 99),
								metric('F', 7200 * 52),
							]
						: [];
				return res(ctx.json({ status: 'success', data: { data: { results } } }));
			}),
		);
		render(
			<Route path={ROUTES.SERVICE_METRICS}>
				<Endpoints servicename="frontend" />
			</Route>,
			undefined,
			{
				initialRoute: '/services/frontend',
				appContextOverrides: {
					featureFlags: defaultFeatureFlags.map((flag) =>
						flag.name === FeatureKeys.USE_SPAN_METRICS
							? { ...flag, active: true }
							: flag,
					),
				},
			},
		);

		await waitFor(() => expect(names()).toStrictEqual(['HTTP GET']));
		const [row] = screen.getAllByTestId('top-operation-row');
		expect(row).toHaveTextContent('99 ms');
		expect(row).toHaveTextContent('1.0%');
		expect(screen.queryByTestId('endpoints-group-http.route')).toBeNull();
	});
});
