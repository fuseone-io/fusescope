import { QueryClient, QueryClientProvider } from 'react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { GetMetricQueryRange } from 'lib/dashboard/getQueryResults';
import { Widgets } from 'types/api/widgets/widget';

import EndpointsTable from '../Explorer/Domains/DomainDetails/components/EndpointsTable';

jest.mock('lib/dashboard/getQueryResults', () => ({
	GetMetricQueryRange: jest.fn(),
}));

const widget = {
	id: 'w',
	timePreferance: 'GLOBAL_TIME',
	query: { builder: { queryData: [] } },
} as unknown as Widgets;

const tableResponse = (rows: Record<string, unknown>[]): unknown => ({
	payload: {
		data: {
			result: [
				{
					table: {
						columns: [
							{ name: 'http_url', isValueColumn: false },
							{ name: 'http.method', isValueColumn: false },
							{ name: 'Num of Calls', queryName: 'A', isValueColumn: true },
							{ name: 'Latency (ms)', queryName: 'B', isValueColumn: true },
						],
						rows: rows.map((data) => ({ data })),
					},
				},
			],
		},
	},
});

const renderTable = (onRowClick = jest.fn()): void => {
	render(
		<QueryClientProvider
			client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
		>
			<EndpointsTable
				widget={widget}
				timeRange={{ startTime: 1, endTime: 2 }}
				onRowClick={onRowClick}
			/>
		</QueryClientProvider>,
	);
};

describe('EndpointsTable', () => {
	it('lists endpoints busiest first with calls, p99 in ms and group-by columns', async () => {
		(GetMetricQueryRange as jest.Mock).mockResolvedValue(
			tableResponse([
				{
					http_url: 'http://api.example.com:8443/charge?x=1',
					'http.method': 'POST',
					A: 12,
					B: 1_250_000_000,
					F1: 0,
				},
				{
					http_url: 'http://api.example.com/refund',
					'http.method': 'GET',
					A: 40,
					B: 5_000_000,
					F1: 50,
				},
			]),
		);

		renderTable();

		const rows = await screen.findAllByTestId('endpoint-row');
		expect(rows[0]).toHaveTextContent('/refund');
		expect(rows[0]).toHaveTextContent('5 ms');
		expect(rows[1]).toHaveTextContent('/charge?x=1');
		expect(rows[1]).toHaveTextContent('1,250 ms');
		expect(
			screen.getByRole('columnheader', { name: 'http.method' }),
		).toBeVisible();
	});

	it('hands the clicked row to the caller', async () => {
		const onRowClick = jest.fn();
		const row = { http_url: 'http://api.example.com/refund', A: 1 };
		(GetMetricQueryRange as jest.Mock).mockResolvedValue(tableResponse([row]));

		renderTable(onRowClick);
		fireEvent.click(await screen.findByTestId('endpoint-row'));

		expect(onRowClick).toHaveBeenCalledWith(row);
	});

	it('says so when the domain has no endpoints', async () => {
		(GetMetricQueryRange as jest.Mock).mockResolvedValue(tableResponse([]));

		renderTable();

		await expect(
			screen.findByTestId('domain-endpoints-empty'),
		).resolves.toBeVisible();
	});
});
