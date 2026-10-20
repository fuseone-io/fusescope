import { ReactNode } from 'react';
import { Route } from 'react-router-dom';
import { renderHook } from '@testing-library/react';
import ROUTES from 'constants/routes';
import { FeatureKeys } from 'constants/features';
import { server } from 'mocks-server/server';
import { rest } from 'msw';
import {
	AllTheProviders,
	defaultFeatureFlags,
	render,
	screen,
	waitFor,
	within,
} from 'tests/test-utils';

import { useServiceKpis } from '../hooks/useServiceKpis';
import ServiceKpis from '../Tabs/Overview/ServiceKpis';

const CURRENT = {
	requests: 6120,
	rate: 1.7,
	errors: 428,
	errorRate: 7,
	p99: 1120,
	avg: 402,
	apdex: 0.81,
};
const PREVIOUS = {
	requests: 4680,
	rate: 1.31,
	errors: 318,
	errorRate: 6.8,
	p99: 540,
	avg: 291,
	apdex: 0.9,
};

describe('ServiceKpis', () => {
	it('shows each total with its change against the previous period', () => {
		render(
			<ServiceKpis
				current={CURRENT}
				previous={PREVIOUS}
				isLoading={false}
				compare
			/>,
		);

		const strip = within(screen.getByRole('region', { name: 'Service metrics' }));
		expect(strip.getByTestId('kpi-requests')).toHaveTextContent(
			'6,120+31% vs 4,680',
		);
		expect(strip.getByTestId('kpi-error-rate')).toHaveTextContent(
			'7.0%+0.2 pp vs 6.8%',
		);
		const p99 = strip.getByTestId('kpi-p99');
		expect(p99).toHaveTextContent('1.12s↑2.1× vs 540 ms');
		expect(within(p99).getByText('↑2.1×', { exact: false })).toHaveAttribute(
			'data-tone',
			'bad',
		);
		expect(strip.getByTestId('kpi-apdex')).toHaveTextContent('0.81−0.09 vs 0.90');
	});

	it('leaves the deltas out when not comparing', () => {
		render(
			<ServiceKpis
				current={CURRENT}
				previous={PREVIOUS}
				isLoading={false}
				compare={false}
			/>,
		);
		expect(screen.getByTestId('kpi-p99')).toHaveTextContent(
			/^p99 latency1\.12s$/,
		);
	});

	it('drops the strip when the service has no data in the range', () => {
		render(<ServiceKpis isLoading={false} compare />);
		expect(screen.queryByRole('region', { name: 'Service metrics' })).toBeNull();
	});
});

describe('useServiceKpis', () => {
	function captureQueryRange(): jest.Mock {
		const onRequest = jest.fn();
		server.use(
			rest.post('http://localhost/api/v5/query_range', async (req, res, ctx) => {
				onRequest(await req.json());
				return res(
					ctx.json({ status: 'success', data: { data: { results: [] } } }),
				);
			}),
			rest.post(
				'http://localhost/api/v1/service/top_level_operations',
				(_, res, ctx) => res(ctx.json({ checkout: ['GET /cart'] })),
			),
		);
		return onRequest;
	}

	function wrapperWith(spanMetrics: boolean) {
		const featureFlags = defaultFeatureFlags.map((flag) =>
			flag.name === FeatureKeys.USE_SPAN_METRICS
				? { ...flag, active: spanMetrics }
				: flag,
		);
		return function Wrapper({ children }: { children: ReactNode }): JSX.Element {
			return (
				<AllTheProviders
					appContextOverrides={{ featureFlags }}
					initialRoute="/services/checkout"
				>
					<Route path={ROUTES.SERVICE_METRICS}>{children}</Route>
				</AllTheProviders>
			);
		};
	}

	const signals = (body: {
		compositeQuery: { queries: { spec: { signal: string } }[] };
	}): string[] => body.compositeQuery.queries.map((query) => query.spec.signal);

	it('reads span metrics when use_span_metrics is on, like the charts', async () => {
		const onRequest = captureQueryRange();
		renderHook(() => useServiceKpis('checkout'), { wrapper: wrapperWith(true) });

		await waitFor(() => expect(onRequest).toHaveBeenCalled());
		expect(new Set(signals(onRequest.mock.calls[0][0]))).toStrictEqual(
			new Set(['metrics']),
		);
	});

	it('reads the entry spans from traces when it is off', async () => {
		const onRequest = captureQueryRange();
		renderHook(() => useServiceKpis('checkout'), { wrapper: wrapperWith(false) });

		await waitFor(() => expect(onRequest).toHaveBeenCalled());
		expect(new Set(signals(onRequest.mock.calls[0][0]))).toStrictEqual(
			new Set(['traces']),
		);
	});
});
