import { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from 'react-query';
import { Router } from 'react-router-dom';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ROUTES from 'constants/routes';
import { createMemoryHistory } from 'history';
import { ResourceProvider } from 'hooks/useResourceAttribute';
import { IResourceAttribute } from 'hooks/useResourceAttribute/types';
import { decode, encode } from 'js-base64';

import ResourceAttributesFilter from '../ResourceAttributesFilter';

jest.mock('lib/history', () => ({
	__esModule: true,
	default: {
		push: jest.fn(),
		location: { search: '', pathname: '/' },
	},
}));

const mockSafeNavigate = jest.fn();

jest.mock('hooks/useSafeNavigate', () => ({
	useSafeNavigate: (): { safeNavigate: jest.Mock } => ({
		safeNavigate: mockSafeNavigate,
	}),
}));

jest.mock('api/metrics/getResourceAttributes', () => ({
	getResourceAttributesTagKeys: jest.fn(),
	getResourceAttributesTagValues: jest.fn(),
}));

// eslint-disable-next-line import/first, import/order
import {
	getResourceAttributesTagKeys,
	getResourceAttributesTagValues,
	// eslint-disable-next-line import/newline-after-import
} from 'api/metrics/getResourceAttributes';
// eslint-disable-next-line import/first, import/order
import history from 'lib/history';

const mockTagKeys = getResourceAttributesTagKeys as jest.MockedFunction<
	typeof getResourceAttributesTagKeys
>;
const mockTagValues = getResourceAttributesTagValues as jest.MockedFunction<
	typeof getResourceAttributesTagValues
>;

const ENVIRONMENT_KEY = 'resource_deployment.environment';

function tagKeysPayload(keys: string[]): never {
	return {
		statusCode: 200,
		error: null,
		message: 'ok',
		payload: {
			data: {
				attributeKeys: keys.map((key) => ({
					key,
					dataType: 'string',
					type: 'resource',
					isColumn: false,
				})),
			},
		},
	} as unknown as never;
}

function tagValuesPayload(values: string[]): never {
	return {
		statusCode: 200,
		error: null,
		message: 'ok',
		payload: { data: { stringAttributeValues: values } },
	} as unknown as never;
}

function seedUrl(queries: IResourceAttribute[], pathname: string): void {
	const location = history.location as { search: string; pathname: string };
	location.search = queries.length
		? `?resourceAttribute=${encode(JSON.stringify(queries))}`
		: '';
	location.pathname = pathname;
}

/** The filters in the last URL the filter navigated to. */
function queriesInUrl(): IResourceAttribute[] {
	const url = mockSafeNavigate.mock.calls.at(-1)?.[0] as string | undefined;
	const param = url
		? new URL(url, 'http://localhost').searchParams.get('resourceAttribute')
		: null;
	return param ? (JSON.parse(decode(param)) as IResourceAttribute[]) : [];
}

function renderFilter(pathname: string): void {
	const routerHistory = createMemoryHistory({
		initialEntries: [`${pathname}${history.location.search}`],
	});
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});

	function Wrapper({ children }: { children: ReactNode }): JSX.Element {
		return (
			<QueryClientProvider client={queryClient}>
				<Router history={routerHistory}>
					<ResourceProvider>{children}</ResourceProvider>
				</Router>
			</QueryClientProvider>
		);
	}

	render(
		<Wrapper>
			<ResourceAttributesFilter />
		</Wrapper>,
	);
}

const attributeInput = (): HTMLElement =>
	within(screen.getByTestId('resource-attributes-filter')).getByRole('combobox');

describe('ResourceAttributesFilter', () => {
	beforeEach(() => {
		mockSafeNavigate.mockReset();
		mockTagKeys.mockReset();
		mockTagValues.mockReset();
		mockTagKeys.mockImplementation(async ({ match }) =>
			match === ENVIRONMENT_KEY
				? tagKeysPayload([ENVIRONMENT_KEY])
				: tagKeysPayload([ENVIRONMENT_KEY, 'resource_k8s.cluster.name']),
		);
		mockTagValues.mockImplementation(async ({ tagKey }) =>
			tagKey === ENVIRONMENT_KEY
				? tagValuesPayload(['production', 'staging'])
				: tagValuesPayload(['prod-us-east', 'prod-eu-west']),
		);
		seedUrl([], '/');
	});

	it('shows every applied filter on the service map, including ones it cannot apply', async () => {
		seedUrl(
			[
				{
					id: 'svc',
					tagKey: 'resource_service_name',
					operator: 'IN',
					tagValue: ['frontend'],
				},
				{
					id: 'env',
					tagKey: ENVIRONMENT_KEY,
					operator: 'IN',
					tagValue: ['production'],
				},
			],
			ROUTES.SERVICE_MAP,
		);

		renderFilter(ROUTES.SERVICE_MAP);

		await waitFor(() =>
			expect(screen.getByText(/service\.name/)).toBeInTheDocument(),
		);
		expect(screen.getByTestId('resource-environment-filter')).toHaveTextContent(
			'production',
		);
	});

	it('keeps the environment list open so more than one environment can be picked', async () => {
		const user = userEvent.setup();
		renderFilter('/services');

		await user.click(screen.getByTestId('resource-environment-filter'));
		await user.click(await screen.findByRole('option', { name: 'production' }));
		await user.click(screen.getByRole('option', { name: 'staging' }));

		await waitFor(() =>
			expect(queriesInUrl()).toMatchObject([
				{
					tagKey: ENVIRONMENT_KEY,
					operator: 'IN',
					tagValue: ['production', 'staging'],
				},
			]),
		);
		expect(screen.getByRole('option', { name: 'staging' })).toHaveAttribute(
			'aria-selected',
			'true',
		);
		expect(screen.getByTestId('resource-environment-filter')).toHaveTextContent(
			'production, staging',
		);
	});

	it('drops the environment filter when the last environment is unticked', async () => {
		const user = userEvent.setup();
		seedUrl(
			[
				{
					id: 'env',
					tagKey: ENVIRONMENT_KEY,
					operator: 'IN',
					tagValue: ['production'],
				},
			],
			'/services',
		);
		renderFilter('/services');

		await user.click(screen.getByTestId('resource-environment-filter'));
		await user.click(await screen.findByRole('option', { name: 'production' }));

		await waitFor(() => expect(queriesInUrl()).toStrictEqual([]));
	});

	it('builds a key, operator and values filter and applies it when the list closes', async () => {
		const user = userEvent.setup();
		renderFilter('/services');

		await user.click(attributeInput());
		const keys = await screen.findAllByRole('option');
		expect(keys.map((option) => option.textContent)).toStrictEqual([
			'k8s.cluster.name',
		]);

		await user.click(keys[0]);
		await user.click(await screen.findByRole('option', { name: 'IN' }));
		await user.click(await screen.findByRole('option', { name: 'prod-us-east' }));
		await user.click(screen.getByRole('option', { name: 'prod-eu-west' }));

		expect(mockTagValues).toHaveBeenCalledWith({
			tagKey: 'resource_k8s.cluster.name',
			metricName: 'signoz_calls_total',
		});
		expect(queriesInUrl()).toStrictEqual([]);

		await user.keyboard('{Escape}');

		await waitFor(() =>
			expect(queriesInUrl()).toMatchObject([
				{
					tagKey: 'resource_k8s.cluster.name',
					operator: 'IN',
					tagValue: ['prod-us-east', 'prod-eu-west'],
				},
			]),
		);
		expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
	});

	it('keeps the staged steps when the field around the input is clicked', async () => {
		const user = userEvent.setup();
		renderFilter('/services');

		await user.click(attributeInput());
		await user.click(
			await screen.findByRole('option', { name: 'k8s.cluster.name' }),
		);
		await screen.findByRole('option', { name: 'IN' });

		await user.click(
			within(screen.getByTestId('resource-attributes-filter')).getByText(
				'k8s.cluster.name',
			),
		);

		expect(attributeInput()).toHaveFocus();
		expect(screen.getByRole('option', { name: 'IN' })).toBeInTheDocument();
	});

	it('picks options with the keyboard', async () => {
		const user = userEvent.setup();
		renderFilter('/services');

		await user.click(attributeInput());
		await screen.findByRole('option', { name: 'k8s.cluster.name' });
		await user.keyboard('{Enter}');
		await screen.findByRole('option', { name: 'Not IN' });
		await user.keyboard('{ArrowDown}{Enter}');
		await screen.findByRole('option', { name: 'prod-us-east' });
		await user.keyboard('{Enter}{Escape}');

		await waitFor(() =>
			expect(queriesInUrl()).toMatchObject([
				{
					tagKey: 'resource_k8s.cluster.name',
					operator: 'Not IN',
					tagValue: ['prod-us-east'],
				},
			]),
		);
	});

	it('narrows the options to the typed text', async () => {
		const user = userEvent.setup();
		mockTagKeys.mockResolvedValue(
			tagKeysPayload(['resource_k8s.cluster.name', 'resource_service.name']),
		);
		renderFilter('/services');

		await user.click(attributeInput());
		await screen.findByRole('option', { name: 'service.name' });
		await user.type(attributeInput(), 'clus');

		expect(
			screen.getAllByRole('option').map((option) => option.textContent),
		).toStrictEqual(['k8s.cluster.name']);
	});

	it('removes one filter from its chip and every filter with clear', async () => {
		const user = userEvent.setup();
		seedUrl(
			[
				{
					id: 'a',
					tagKey: 'resource_k8s.cluster.name',
					operator: 'IN',
					tagValue: ['prod-us-east'],
				},
				{
					id: 'b',
					tagKey: 'resource_service.name',
					operator: 'Not IN',
					tagValue: ['cart', 'checkout'],
				},
			],
			'/services',
		);
		renderFilter('/services');

		expect(screen.getByText('cart, checkout')).toBeInTheDocument();

		await user.click(
			screen.getByRole('button', { name: 'Remove k8s.cluster.name filter' }),
		);
		await waitFor(() =>
			expect(queriesInUrl().map((query) => query.id)).toStrictEqual(['b']),
		);

		await user.click(screen.getByRole('button', { name: 'Clear filters' }));
		await waitFor(() => expect(queriesInUrl()).toStrictEqual([]));
	});

	it('says so when there are no resource attributes to filter on', async () => {
		const user = userEvent.setup();
		mockTagKeys.mockResolvedValue(tagKeysPayload([]));
		renderFilter('/services');

		await user.click(attributeInput());

		await expect(
			screen.findByText(/No resource attributes available to filter/),
		).resolves.toBeInTheDocument();
	});
});
