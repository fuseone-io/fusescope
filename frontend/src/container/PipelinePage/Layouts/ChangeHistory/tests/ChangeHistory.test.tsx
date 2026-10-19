import { I18nextProvider } from 'react-i18next';
import { QueryClient, QueryClientProvider } from 'react-query';
// eslint-disable-next-line no-restricted-imports
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { fireEvent, render, within } from '@testing-library/react';
import TimezoneProvider from 'providers/Timezone';
import i18n from 'ReactI18';
import store from 'store';

import ChangeHistory from '../index';
import { pipelineData, pipelineDataHistory } from './testUtils';

const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			refetchOnWindowFocus: false,
		},
	},
});

describe('ChangeHistory test', () => {
	it('should render changeHistory correctly', () => {
		const { getByRole } = render(
			<MemoryRouter>
				<QueryClientProvider client={queryClient}>
					<Provider store={store}>
						<I18nextProvider i18n={i18n}>
							<TimezoneProvider>
								<ChangeHistory pipelineData={pipelineData} />
							</TimezoneProvider>
						</I18nextProvider>
					</Provider>
				</QueryClientProvider>
			</MemoryRouter>,
		);

		const table = within(getByRole('table'));
		// change History table headers
		[
			'Version',
			'Deployment Stage',
			'Last Deploy Message',
			'Last Deployed Time',
			'Edited by',
		].forEach((text) => expect(table.getByText(text)).toBeInTheDocument());

		// table content
		expect(table.getAllByText('test-user')).toHaveLength(2);
		expect(table.getAllByText('Deployment was successful')).toHaveLength(2);
	});

	it('test deployment stage and icon based on history data', () => {
		const { getByRole, container } = render(
			<MemoryRouter>
				<QueryClientProvider client={queryClient}>
					<Provider store={store}>
						<I18nextProvider i18n={i18n}>
							<TimezoneProvider>
								<ChangeHistory
									pipelineData={{
										...pipelineData,
										history: pipelineDataHistory,
									}}
								/>
							</TimezoneProvider>
						</I18nextProvider>
					</Provider>
				</QueryClientProvider>
			</MemoryRouter>,
		);

		const table = getByRole('table');
		const { getByText } = within(table);
		// assertion for different deployment stages
		expect(
			table.querySelector('[data-testid="deployment-icon-in-progress"]'),
		).toBeInTheDocument();
		expect(getByText('In Progress')).toBeInTheDocument();

		expect(
			table.querySelector('[data-testid="deployment-icon-dirty"]'),
		).toBeInTheDocument();
		expect(getByText('Dirty')).toBeInTheDocument();

		expect(
			table.querySelector('[data-testid="deployment-icon-failed"]'),
		).toBeInTheDocument();
		expect(getByText('Failed')).toBeInTheDocument();

		expect(
			table.querySelector('[data-testid="deployment-icon-unknown"]'),
		).toBeInTheDocument();
		expect(getByText('Unknown')).toBeInTheDocument();

		expect(container.querySelectorAll('.ant-table-row')).toHaveLength(5);
	});

	it('shows the details of the version picked in the table', () => {
		const history = pipelineDataHistory.map((item, index) => ({
			...item,
			version: 10 - index,
			deployResult: `message of version ${10 - index}`,
		}));
		const { getByRole, getByTestId } = render(
			<MemoryRouter>
				<QueryClientProvider client={queryClient}>
					<Provider store={store}>
						<I18nextProvider i18n={i18n}>
							<TimezoneProvider>
								<ChangeHistory pipelineData={{ ...pipelineData, history }} />
							</TimezoneProvider>
						</I18nextProvider>
					</Provider>
				</QueryClientProvider>
			</MemoryRouter>,
		);

		const details = getByTestId('pipeline-version-details');
		// The latest version is shown first.
		expect(
			within(details).getByText('message of version 10'),
		).toBeInTheDocument();

		const [, secondRow] = within(getByRole('table')).getAllByRole('row').slice(1);
		fireEvent.click(secondRow);

		expect(within(details).getByText('v9')).toBeInTheDocument();
		expect(within(details).getByText('message of version 9')).toBeInTheDocument();
	});
});
