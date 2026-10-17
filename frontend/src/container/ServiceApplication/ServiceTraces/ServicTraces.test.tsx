import { act, fireEvent, render, screen } from 'tests/test-utils';

import ServiceTraces from '.';

describe('ServicesTraces', () => {
	it('Should render the component', async () => {
		await act(() => {
			render(<ServiceTraces />);
		});
		const applicationHeader = screen.getByText(/application/i);
		expect(applicationHeader).toBeInTheDocument();
		const p99LatencyHeader = screen.getByText(/p99 latency \(in ms\)/i);
		expect(p99LatencyHeader).toBeInTheDocument();
		const errorRateHeader = screen.getByText(/error rate \(% of total\)/i);
		expect(errorRateHeader).toBeInTheDocument();
	});

	it('Should render the Services with Services', async () => {
		act(() => {
			render(<ServiceTraces />);
		});
		const servierName = await screen.findByText(/TestService/i, {
			exact: true,
		});
		expect(servierName).toBeInTheDocument();
		const p99Latency = await screen.findByText(/8\.11/i);
		expect(p99Latency).toBeInTheDocument();
	});

	it('Should click on p99 latency and sort the table', async () => {
		act(() => {
			render(<ServiceTraces />);
		});
		const p99LatencyHeader = await screen.findByText(/p99 latency \(in ms\)/i);
		expect(p99LatencyHeader).toBeInTheDocument();
		await screen.findByText(/TestCustomerService/i);

		// Sorted by p99, highest first.
		const allRow = screen.getAllByTestId('service-row');
		expect(allRow).toHaveLength(2);
		expect(allRow[0].innerHTML).toContain('TestCustomerService');
		expect(allRow[1].innerHTML).toContain('TestService');

		const tableHeader = await screen.findAllByRole('columnheader');
		expect(tableHeader).toHaveLength(4);

		fireEvent.click(screen.getByTestId('services-sort-p99'));

		const allSortedRowAsc = screen.getAllByTestId('service-row');
		expect(allSortedRowAsc).toHaveLength(2);
		expect(allSortedRowAsc[0].innerHTML).toContain('TestService');

		fireEvent.click(screen.getByTestId('services-sort-p99'));
		const allSortedRowDsc = screen.getAllByTestId('service-row');
		expect(allSortedRowDsc).toHaveLength(2);
		expect(allSortedRowDsc[0].innerHTML).toContain('TestCustomerService');
	});
});
