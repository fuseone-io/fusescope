import { server } from 'mocks-server/server';
import { rest } from 'msw';
import {
	render,
	screen,
	waitForElementToBeRemoved,
	within,
} from 'tests/test-utils';
import { ServicesList } from 'types/api/metrics/getService';

import ServiceKpis from '../Tabs/Overview/ServiceKpis';

const CHECKOUT: ServicesList = {
	serviceName: 'checkout',
	p99: 612_000_000,
	avgDuration: 48_000_000,
	numCalls: 14_460,
	callRate: 2.41,
	numErrors: 275,
	errorRate: 1.9,
};

function respondWith(services: ServicesList[]): void {
	server.use(
		rest.post('http://localhost/api/v2/services', (req, res, ctx) =>
			res(ctx.status(200), ctx.json({ status: 'success', data: services })),
		),
	);
}

describe('ServiceKpis', () => {
	it('shows the service RED metrics from the services endpoint', async () => {
		respondWith([{ ...CHECKOUT, serviceName: 'cart', callRate: 9 }, CHECKOUT]);
		render(<ServiceKpis servicename="checkout" />);

		const strip = await screen.findByRole('region', { name: 'Service metrics' });
		await expect(within(strip).findByText('2.41')).resolves.toBeInTheDocument();
		expect(
			within(screen.getByTestId('kpi-error-rate')).getByText('1.90'),
		).toBeInTheDocument();
		expect(
			within(screen.getByTestId('kpi-p99')).getByText('612.00'),
		).toBeInTheDocument();
		expect(
			within(screen.getByTestId('kpi-avg')).getByText('48.00'),
		).toBeInTheDocument();
		expect(
			within(screen.getByTestId('kpi-calls')).getByText('14,460'),
		).toBeInTheDocument();
		expect(
			within(screen.getByTestId('kpi-errors')).getByText('275'),
		).toBeInTheDocument();
	});

	it('drops the strip when the service has no data in the range', async () => {
		respondWith([{ ...CHECKOUT, serviceName: 'cart' }]);
		render(<ServiceKpis servicename="checkout" />);

		await waitForElementToBeRemoved(() =>
			screen.queryByRole('region', { name: 'Service metrics' }),
		);
		expect(screen.queryByTestId('service-kpis')).not.toBeInTheDocument();
	});
});
