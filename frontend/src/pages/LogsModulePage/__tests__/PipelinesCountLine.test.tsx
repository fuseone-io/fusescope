import { QueryClient, QueryClientProvider } from 'react-query';
import { render, screen } from '@testing-library/react';

import PipelinesCountLine from '../PipelinesCountLine';

function renderWith(client: QueryClient): void {
	render(
		<QueryClientProvider client={client}>
			<PipelinesCountLine />
		</QueryClientProvider>,
	);
}

describe('PipelinesCountLine', () => {
	it('reads the pipelines the page already loaded', () => {
		const client = new QueryClient();
		client.setQueryData(['version', 'latest', 'pipeline'], {
			payload: { version: 3, pipelines: [{ id: 'a' }, { id: 'b' }], history: [] },
		});
		renderWith(client);

		expect(screen.getByTestId('pipelines-count-line')).toHaveTextContent(
			'2 pipelines, configuration version 3',
		);
	});

	it('shows nothing and fetches nothing before the page loads them', () => {
		const client = new QueryClient();
		const fetchSpy = jest.spyOn(client, 'fetchQuery');
		renderWith(client);

		expect(screen.queryByTestId('pipelines-count-line')).not.toBeInTheDocument();
		expect(fetchSpy).not.toHaveBeenCalled();
		expect(client.isFetching()).toBe(0);
	});
});
