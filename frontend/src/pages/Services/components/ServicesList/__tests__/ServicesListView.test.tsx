import { render, screen, waitFor } from 'tests/test-utils';

import ServicesList from '../ServicesList';
import { services } from './servicesMock';

describe('ServicesList view', () => {
	it('renders without errors', async () => {
		render(
			<ServicesList services={services} loading={false} isMetricData={false} />,
		);

		await waitFor(() => {
			expect(
				screen.getAllByRole('columnheader').map((header) => header.textContent),
			).toStrictEqual([
				'Service',
				'Rate',
				'Error %',
				'p50',
				'p95',
				'p99 latency',
				'Requests',
				'Actions',
			]);
		});
	});

	it('renders if the data is loaded in the table', async () => {
		render(
			<ServicesList services={services} loading={false} isMetricData={false} />,
		);

		expect(screen.getByText('frontend')).toBeInTheDocument();
	});

	it('reads span-metrics p99 as ms, the unit signoz_latency reports', async () => {
		render(
			<ServicesList
				services={[{ ...services[0], p99: 612.5 }]}
				loading={false}
				isMetricData
			/>,
		);

		expect(screen.getByTestId('service-p99')).toHaveTextContent('613 ms');
	});

	it('keeps the header and shows placeholder rows while loading', async () => {
		render(<ServicesList services={[]} loading isMetricData={false} />);

		expect(screen.getAllByRole('columnheader')).toHaveLength(8);
		expect(screen.getAllByTestId('service-row-loading').length).toBeGreaterThan(
			0,
		);
		expect(screen.queryByTestId('services-empty')).not.toBeInTheDocument();
	});

	it('renders no data when required conditions are met', async () => {
		render(<ServicesList services={[]} loading={false} isMetricData={false} />);

		expect(screen.getByTestId('services-empty')).toHaveTextContent('No services');
	});
});
