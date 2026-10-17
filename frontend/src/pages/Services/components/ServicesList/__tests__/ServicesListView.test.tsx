import { render, screen, waitFor } from 'tests/test-utils';

import ServicesList from '../ServicesList';
import { services } from './servicesMock';

describe('ServicesList view', () => {
	it('renders without errors', async () => {
		render(
			<ServicesList services={services} loading={false} isMetricData={false} />,
		);

		await waitFor(() => {
			expect(screen.getByText(/application/i)).toBeInTheDocument();
			expect(screen.getByText(/p99 latency \(in ms\)/i)).toBeInTheDocument();
			expect(screen.getByText(/error rate \(% of total\)/i)).toBeInTheDocument();
			expect(screen.getByText(/operations per second/i)).toBeInTheDocument();
		});
	});

	it('renders if the data is loaded in the table', async () => {
		render(
			<ServicesList services={services} loading={false} isMetricData={false} />,
		);

		expect(screen.getByText('frontend')).toBeInTheDocument();
	});

	it('shows p99 in ns for span metrics', async () => {
		render(<ServicesList services={services} loading={false} isMetricData />);

		expect(screen.getByText(/p99 latency \(in ns\)/i)).toBeInTheDocument();
	});

	it('keeps the header and shows placeholder rows while loading', async () => {
		render(<ServicesList services={[]} loading isMetricData={false} />);

		expect(screen.getAllByRole('columnheader')).toHaveLength(4);
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
