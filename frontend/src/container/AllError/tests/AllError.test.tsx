// eslint-disable-next-line no-restricted-imports
import { Provider, useSelector } from 'react-redux';
import { Router } from 'react-router-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ENVIRONMENT } from 'constants/env';
import history from 'lib/history';
import { server } from 'mocks-server/server';
import { rest } from 'msw';
import MockQueryClientProvider from 'providers/test/MockQueryClientProvider';
import TimezoneProvider from 'providers/Timezone';
import store from 'store';

import '@testing-library/jest-dom';

import * as appContextHooks from '../../../providers/App/App';
import { LicenseEvent } from '../../../types/api/licensesV3/getActive';
import { useAllErrorsQueryState } from 'pages/AllErrors/QueryStateContext';

import AllErrors from '../index';
import {
	INIT_URL_WITH_COMMON_QUERY,
	MOCK_ERROR_LIST,
	TAG_FROM_QUERY,
} from './constants';

jest.mock('hooks/useResourceAttribute', () =>
	jest.fn(() => ({
		queries: [],
	})),
);

jest.mock('react-redux', () => ({
	...jest.requireActual('react-redux'),
	useSelector: jest.fn(),
}));

jest.spyOn(appContextHooks, 'useAppContext').mockReturnValue({
	user: {
		role: 'admin',
	},
	activeLicenseV3: {
		event_queue: {
			created_at: '0',
			event: LicenseEvent.NO_EVENT,
			scheduled_at: '0',
			status: '',
			updated_at: '0',
		},
		license: {
			license_key: 'test-license-key',
			license_type: 'trial',
			org_id: 'test-org-id',
			plan_id: 'test-plan-id',
			plan_name: 'test-plan-name',
			plan_type: 'trial',
			plan_version: 'test-plan-version',
		},
	},
} as any);

// The list keeps its state in the url through `lib/history`, so the router
// must follow that history for the table to see its own updates.
function renderExceptions(initUrl = '/exceptions'): void {
	history.replace(initUrl);
	render(<Exceptions />);
}

function Exceptions(): JSX.Element {
	return (
		<Router history={history}>
			<TimezoneProvider>
				<Provider store={store}>
					<MockQueryClientProvider>
						<AllErrors />
					</MockQueryClientProvider>
				</Provider>
			</TimezoneProvider>
		</Router>
	);
}

const BASE_URL = ENVIRONMENT.baseURL;
const listErrorsURL = `${BASE_URL}/api/v1/listErrors`;
const countErrorsURL = `${BASE_URL}/api/v1/countErrors`;

const postListErrorsSpy = jest.fn();

describe('Exceptions - All Errors', () => {
	beforeEach(() => {
		(useSelector as jest.Mock).mockReturnValue({
			maxTime: 1000,
			minTime: 0,
			loading: false,
		});
		server.use(
			rest.post(listErrorsURL, async (req, res, ctx) => {
				const body = await req.json();
				postListErrorsSpy(body);
				return res(ctx.status(200), ctx.json(MOCK_ERROR_LIST));
			}),
		);
		server.use(
			rest.post(countErrorsURL, (req, res, ctx) =>
				res(ctx.status(200), ctx.json(540)),
			),
		);
	});

	it('renders correctly with default props', async () => {
		renderExceptions();
		const item = await screen.findByText(/redis timeout/i);
		expect(item).toBeInTheDocument();
	});

	it('links each exception to its detail page', async () => {
		renderExceptions();
		await screen.findByText(/redis timeout/i);

		expect(
			screen.getByRole('link', { name: '*errors.errorString' }),
		).toHaveAttribute(
			'href',
			'/error-detail?groupId=511b9c91a92b9c5166ecb77235f5743b&timestamp=1744655277797616374',
		);
	});

	it('links each exception to its service', async () => {
		renderExceptions();
		await screen.findByText(/redis timeout/i);

		const service = screen.getByTestId('exception-service');
		expect(service).toHaveAttribute(
			'href',
			expect.stringMatching(/^\/services\/redis-manual(\?|$)/),
		);
		expect(service).toHaveTextContent('redis-manual');
	});

	it('shares the number of exception groups with the page header', async () => {
		useAllErrorsQueryState.setState({ groupCount: null });
		renderExceptions();
		await screen.findByText(/redis timeout/i);

		await waitFor(() =>
			expect(useAllErrorsQueryState.getState().groupCount).toBe(540),
		);
	});

	it('should sort Error Message appropriately', async () => {
		renderExceptions();
		await screen.findByText(/redis timeout/i);

		const sortByType = screen.getByTestId('exceptions-sort-exceptionType');
		const typeHeader = sortByType.closest('th');

		// sort by ascending
		expect(typeHeader).toHaveAttribute('aria-sort', 'none');
		fireEvent.click(sortByType);
		await waitFor(() =>
			expect(typeHeader).toHaveAttribute('aria-sort', 'ascending'),
		);
		let queryParams = new URLSearchParams(window.location.search);
		expect(queryParams.get('order')).toBe('ascending');
		expect(queryParams.get('orderParam')).toBe('exceptionType');

		// sort by descending
		fireEvent.click(sortByType);
		await waitFor(() =>
			expect(typeHeader).toHaveAttribute('aria-sort', 'descending'),
		);
		queryParams = new URLSearchParams(window.location.search);
		expect(queryParams.get('order')).toBe('descending');
	});

	it('filters by exception type from the column search', async () => {
		renderExceptions(
			'/exceptions?pageSize=10&offset=20&order=ascending&orderParam=serviceName',
		);
		await screen.findByText(/redis timeout/i);

		fireEvent.click(screen.getByTestId('exceptions-filter-exceptionType'));
		fireEvent.change(
			await screen.findByPlaceholderText('Search by exception type'),
			{
				target: { value: 'redis' },
			},
		);
		fireEvent.click(screen.getByRole('button', { name: 'Search' }));

		await waitFor(() => {
			const qp = new URLSearchParams(window.location.search);
			expect(qp.get('exceptionType')).toBe('redis');
		});
		const queryParams = new URLSearchParams(window.location.search);
		expect(queryParams.get('offset')).toBe('0');
		expect(queryParams.get('orderParam')).toBe('serviceName');
	});

	it('should call useQueries with exact composite query object', async () => {
		renderExceptions(INIT_URL_WITH_COMMON_QUERY);
		await screen.findByText(/redis timeout/i);
		expect(postListErrorsSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				tags: TAG_FROM_QUERY,
			}),
		);
	});

	describe('pagination edge cases', () => {
		it('should navigate to page 2 when pageSize=100 and clicking next', async () => {
			// Arrange: start with pageSize=100 and offset=0
			renderExceptions(
				`/exceptions?pageSize=100&offset=0&order=ascending&orderParam=serviceName`,
			);

			// Wait for initial load
			await screen.findByText(/redis timeout/i);

			fireEvent.click(screen.getByTestId('pagination-next'));

			await waitFor(() => {
				const qp = new URLSearchParams(window.location.search);
				expect(qp.get('offset')).toBe('100');
			});
			const queryParams = new URLSearchParams(window.location.search);
			expect(queryParams.get('pageSize')).toBe('100');
			expect(queryParams.get('offset')).toBe('100');
		});

		it('initializes current page from URL (offset/pageSize)', async () => {
			// offset=100, pageSize=100 => current page should be 2
			renderExceptions(
				`/exceptions?pageSize=100&offset=100&order=ascending&orderParam=serviceName`,
			);
			await screen.findByText(/redis timeout/i);
			expect(screen.getByTestId('pagination-page-2')).toHaveAttribute(
				'aria-current',
				'page',
			);
			const qp = new URLSearchParams(window.location.search);
			expect(qp.get('pageSize')).toBe('100');
			expect(qp.get('offset')).toBe('100');
		});

		it('clicking a numbered page updates offset correctly', async () => {
			// pageSize=100, click page 3 => offset = 200
			renderExceptions(
				`/exceptions?pageSize=100&offset=0&order=ascending&orderParam=serviceName`,
			);
			await screen.findByText(/redis timeout/i);
			fireEvent.click(screen.getByTestId('pagination-page-3'));
			await waitFor(() => {
				const qp = new URLSearchParams(window.location.search);
				expect(qp.get('offset')).toBe('200');
			});
		});
	});
});
